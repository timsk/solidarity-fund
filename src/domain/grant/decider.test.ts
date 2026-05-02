import { describe, expect, it } from "bun:test";
import { IllegalStateError } from "@event-driven-io/emmett";
import { decide, evolve, initialState } from "./decider.ts";
import type { GrantState } from "./types.ts";

const NOW = "2026-01-01T00:00:00.000Z";
const LATER = "2026-02-01T00:00:00.000Z";

const GRANT_CORE = {
	grantId: "grant-1",
	applicationId: "app-1",
	applicantId: "applicant-07700900000-jane doe",
	lotteryName: "2026-01",
	rank: 1,
};

const awaitingReviewState: GrantState = {
	...GRANT_CORE,
	status: "awaiting_review",
	sortCode: "12-34-56",
	accountNumber: "12345678",
	proofOfAddressRef: "ref-001",
	poaAttempts: 0,
};

const poaApprovedState: GrantState = {
	...GRANT_CORE,
	status: "poa_approved",
	volunteerId: "vol-1",
	poaAttempts: 0,
};

const awaitingCashState: GrantState = {
	...GRANT_CORE,
	status: "awaiting_cash_handover",
	volunteerId: "vol-1",
};

const offeredCashAltState: GrantState = {
	...GRANT_CORE,
	status: "offered_cash_alternative",
	volunteerId: "vol-1",
};

describe("grant decider", () => {
	describe("CreateGrant", () => {
		it("creates bank grant in awaiting_review state", () => {
			const events = decide(
				{
					type: "CreateGrant",
					data: {
						...GRANT_CORE,
						paymentPreference: "bank",
						createdAt: NOW,
						bankDetails: {
							sortCode: "12-34-56",
							accountNumber: "12345678",
							proofOfAddressRef: "ref-001",
						},
					},
				},
				initialState(),
			);

			expect(events).toHaveLength(1);
			expect(events[0]?.type).toBe("GrantCreated");

			const state = evolve(initialState(), events[0]!);
			expect(state.status).toBe("awaiting_review");
		});

		it("creates cash grant in awaiting_cash_handover state", () => {
			const events = decide(
				{
					type: "CreateGrant",
					data: {
						...GRANT_CORE,
						paymentPreference: "cash",
						createdAt: NOW,
					},
				},
				initialState(),
			);

			const state = evolve(initialState(), events[0]!);
			expect(state.status).toBe("awaiting_cash_handover");
		});

		it("throws when grant already exists", () => {
			expect(() =>
				decide(
					{
						type: "CreateGrant",
						data: {
							...GRANT_CORE,
							paymentPreference: "bank",
							createdAt: NOW,
						},
					},
					awaitingReviewState,
				),
			).toThrow(IllegalStateError);
		});
	});

	describe("RejectProofOfAddress — PoA cash alternative logic", () => {
		it("does NOT emit CashAlternativeOffered on first rejection (poaAttempts = 0)", () => {
			const stateWith0Attempts: GrantState = {
				...awaitingReviewState,
				poaAttempts: 0,
			};
			const events = decide(
				{
					type: "RejectProofOfAddress",
					data: {
						grantId: "grant-1",
						reason: "Document unclear",
						rejectedBy: "vol-1",
						rejectedAt: NOW,
					},
				},
				stateWith0Attempts,
			);

			expect(events).toHaveLength(1);
			expect(events[0]?.type).toBe("ProofOfAddressRejected");
			expect(events.some((e) => e.type === "CashAlternativeOffered")).toBe(
				false,
			);
		});

		it("does NOT emit CashAlternativeOffered on second rejection (poaAttempts = 1)", () => {
			const stateWith1Attempt: GrantState = {
				...awaitingReviewState,
				poaAttempts: 1,
			};
			const events = decide(
				{
					type: "RejectProofOfAddress",
					data: {
						grantId: "grant-1",
						reason: "Still not valid",
						rejectedBy: "vol-1",
						rejectedAt: NOW,
					},
				},
				stateWith1Attempt,
			);

			expect(events).toHaveLength(1);
			expect(events[0]?.type).toBe("ProofOfAddressRejected");
			expect(events.some((e) => e.type === "CashAlternativeOffered")).toBe(
				false,
			);
		});

		it("emits CashAlternativeOffered on third rejection (poaAttempts = 2)", () => {
			const stateWith2Attempts: GrantState = {
				...awaitingReviewState,
				poaAttempts: 2,
			};
			const events = decide(
				{
					type: "RejectProofOfAddress",
					data: {
						grantId: "grant-1",
						reason: "Still not valid",
						rejectedBy: "vol-1",
						rejectedAt: NOW,
					},
				},
				stateWith2Attempts,
			);

			expect(events.some((e) => e.type === "CashAlternativeOffered")).toBe(
				true,
			);
		});

		it("increments poaAttempts in state after rejection", () => {
			const events = decide(
				{
					type: "RejectProofOfAddress",
					data: {
						grantId: "grant-1",
						reason: "Bad doc",
						rejectedBy: "vol-1",
						rejectedAt: NOW,
					},
				},
				awaitingReviewState,
			);

			const newState = events.reduce(
				(s, e) => evolve(s, e),
				awaitingReviewState as GrantState,
			);
			if (newState.status === "awaiting_review") {
				expect(newState.poaAttempts).toBe(1);
			}
		});

		it("transitions to offered_cash_alternative state after CashAlternativeOffered", () => {
			const stateWith2Attempts: GrantState = {
				...awaitingReviewState,
				poaAttempts: 2,
			};
			const events = decide(
				{
					type: "RejectProofOfAddress",
					data: {
						grantId: "grant-1",
						reason: "Still bad",
						rejectedBy: "vol-1",
						rejectedAt: NOW,
					},
				},
				stateWith2Attempts,
			);

			const newState = events.reduce(
				(s, e) => evolve(s, e),
				stateWith2Attempts as GrantState,
			);
			expect(newState.status).toBe("offered_cash_alternative");
		});

		it("throws when not in awaiting_review state", () => {
			expect(() =>
				decide(
					{
						type: "RejectProofOfAddress",
						data: {
							grantId: "grant-1",
							reason: "Bad doc",
							rejectedBy: "vol-1",
							rejectedAt: NOW,
						},
					},
					poaApprovedState,
				),
			).toThrow(IllegalStateError);
		});
	});

	describe("ApproveProofOfAddress", () => {
		it("emits ProofOfAddressApproved in awaiting_review state", () => {
			const events = decide(
				{
					type: "ApproveProofOfAddress",
					data: { grantId: "grant-1", verifiedBy: "vol-1", verifiedAt: NOW },
				},
				awaitingReviewState,
			);

			expect(events).toHaveLength(1);
			expect(events[0]?.type).toBe("ProofOfAddressApproved");
		});

		it("throws outside awaiting_review", () => {
			expect(() =>
				decide(
					{
						type: "ApproveProofOfAddress",
						data: { grantId: "grant-1", verifiedBy: "vol-1", verifiedAt: NOW },
					},
					poaApprovedState,
				),
			).toThrow(IllegalStateError);
		});
	});

	describe("AcceptCashAlternative", () => {
		it("emits CashAlternativeAccepted from offered_cash_alternative state", () => {
			const events = decide(
				{
					type: "AcceptCashAlternative",
					data: { grantId: "grant-1", acceptedAt: NOW },
				},
				offeredCashAltState,
			);

			expect(events).toHaveLength(1);
			expect(events[0]?.type).toBe("CashAlternativeAccepted");
		});

		it("throws when not offered", () => {
			expect(() =>
				decide(
					{
						type: "AcceptCashAlternative",
						data: { grantId: "grant-1", acceptedAt: NOW },
					},
					awaitingReviewState,
				),
			).toThrow(IllegalStateError);
		});
	});

	describe("DeclineCashAlternative", () => {
		it("emits CashAlternativeDeclined + SlotReleased", () => {
			const events = decide(
				{
					type: "DeclineCashAlternative",
					data: { grantId: "grant-1", declinedAt: NOW },
				},
				offeredCashAltState,
			);

			expect(events).toHaveLength(2);
			expect(events[0]?.type).toBe("CashAlternativeDeclined");
			expect(events[1]?.type).toBe("SlotReleased");
		});
	});

	describe("RecordPayment", () => {
		it("records bank payment from poa_approved state", () => {
			const events = decide(
				{
					type: "RecordPayment",
					data: {
						grantId: "grant-1",
						amount: 500,
						method: "bank",
						paidBy: "vol-1",
						paidAt: NOW,
					},
				},
				poaApprovedState,
			);

			expect(events[0]?.type).toBe("GrantPaid");
		});

		it("records cash payment from awaiting_cash_handover state", () => {
			const events = decide(
				{
					type: "RecordPayment",
					data: {
						grantId: "grant-1",
						amount: 500,
						method: "cash",
						paidBy: "vol-1",
						paidAt: NOW,
					},
				},
				awaitingCashState,
			);

			expect(events[0]?.type).toBe("GrantPaid");
		});

		it("throws when method is cash but state is poa_approved", () => {
			expect(() =>
				decide(
					{
						type: "RecordPayment",
						data: {
							grantId: "grant-1",
							amount: 500,
							method: "cash",
							paidBy: "vol-1",
							paidAt: NOW,
						},
					},
					poaApprovedState,
				),
			).toThrow(IllegalStateError);
		});

		it("throws when method is bank but state is awaiting_cash_handover", () => {
			expect(() =>
				decide(
					{
						type: "RecordPayment",
						data: {
							grantId: "grant-1",
							amount: 500,
							method: "bank",
							paidBy: "vol-1",
							paidAt: NOW,
						},
					},
					awaitingCashState,
				),
			).toThrow(IllegalStateError);
		});

		it("throws when no volunteer assigned", () => {
			const stateNoVol: GrantState = {
				...GRANT_CORE,
				status: "poa_approved",
				poaAttempts: 0,
				// no volunteerId
			};
			expect(() =>
				decide(
					{
						type: "RecordPayment",
						data: {
							grantId: "grant-1",
							amount: 500,
							method: "bank",
							paidBy: "vol-1",
							paidAt: NOW,
						},
					},
					stateNoVol,
				),
			).toThrow(IllegalStateError);
		});
	});

	describe("ReleaseSlot", () => {
		it("emits SlotReleased from awaiting_review state", () => {
			const events = decide(
				{
					type: "ReleaseSlot",
					data: {
						grantId: "grant-1",
						reason: "Applicant withdrew",
						releasedBy: "vol-1",
						releasedAt: NOW,
					},
				},
				awaitingReviewState,
			);

			expect(events[0]?.type).toBe("SlotReleased");
		});

		it("throws from terminal state (released)", () => {
			const releasedState: GrantState = {
				...GRANT_CORE,
				status: "released",
				reason: "test",
				releasedAt: NOW,
			};
			expect(() =>
				decide(
					{
						type: "ReleaseSlot",
						data: {
							grantId: "grant-1",
							reason: "duplicate release",
							releasedBy: "vol-1",
							releasedAt: LATER,
						},
					},
					releasedState,
				),
			).toThrow(IllegalStateError);
		});
	});

	describe("RecordReimbursement", () => {
		it("emits VolunteerReimbursed from awaiting_reimbursement state", () => {
			const awaitingReimbState: GrantState = {
				...GRANT_CORE,
				status: "awaiting_reimbursement",
				amount: 500,
				paidBy: "vol-1",
				paidAt: NOW,
				volunteerId: "vol-1",
			};

			const events = decide(
				{
					type: "RecordReimbursement",
					data: {
						grantId: "grant-1",
						volunteerId: "vol-1",
						expenseReference: "EXP-001",
						reimbursedAt: LATER,
					},
				},
				awaitingReimbState,
			);

			expect(events[0]?.type).toBe("VolunteerReimbursed");
		});

		it("throws from non-reimbursement state", () => {
			expect(() =>
				decide(
					{
						type: "RecordReimbursement",
						data: {
							grantId: "grant-1",
							volunteerId: "vol-1",
							expenseReference: "EXP-001",
							reimbursedAt: LATER,
						},
					},
					awaitingReviewState,
				),
			).toThrow(IllegalStateError);
		});
	});

	describe("evolve — state transitions", () => {
		it("bank grant: awaiting_review → poa_approved after ProofOfAddressApproved", () => {
			const state = evolve(awaitingReviewState, {
				type: "ProofOfAddressApproved",
				data: { grantId: "grant-1", verifiedBy: "vol-1", verifiedAt: NOW },
			});

			expect(state.status).toBe("poa_approved");
		});

		it("poa_approved → awaiting_reimbursement after cash GrantPaid", () => {
			const state = evolve(poaApprovedState, {
				type: "GrantPaid",
				data: {
					grantId: "grant-1",
					applicationId: "app-1",
					applicantId: GRANT_CORE.applicantId,
					lotteryName: "2026-01",
					amount: 500,
					method: "cash",
					paidBy: "vol-1",
					paidAt: NOW,
				},
			});

			expect(state.status).toBe("awaiting_reimbursement");
		});

		it("poa_approved → paid after bank GrantPaid", () => {
			const state = evolve(poaApprovedState, {
				type: "GrantPaid",
				data: {
					grantId: "grant-1",
					applicationId: "app-1",
					applicantId: GRANT_CORE.applicantId,
					lotteryName: "2026-01",
					amount: 500,
					method: "bank",
					paidBy: "vol-1",
					paidAt: NOW,
				},
			});

			expect(state.status).toBe("paid");
		});

		it("initialises poaAttempts to 0 for bank grant", () => {
			const state = evolve(initialState(), {
				type: "GrantCreated",
				data: {
					...GRANT_CORE,
					paymentPreference: "bank",
					createdAt: NOW,
					bankDetails: {
						sortCode: "12-34-56",
						accountNumber: "12345678",
						proofOfAddressRef: "ref",
					},
				},
			});

			if (state.status === "awaiting_review") {
				expect(state.poaAttempts).toBe(0);
			}
		});
	});
});
