import { describe, expect, it } from "bun:test";
import { IllegalStateError } from "@event-driven-io/emmett";
import { decide, evolve, initialState } from "./decider.ts";
import type { ApplicationState } from "./types.ts";

const NOW = "2026-01-01T00:00:00.000Z";
const APP_ID = "app-001";
const APPLICANT_ID = "applicant-07700900000-jane doe";
const MONTH = "2026-01";

const acceptedState: ApplicationState = {
	status: "accepted",
	applicationId: APP_ID,
	applicantId: APPLICANT_ID,
	lotteryName: MONTH,
};

const confirmedState: ApplicationState = {
	status: "confirmed",
	applicationId: APP_ID,
	applicantId: APPLICANT_ID,
	lotteryName: MONTH,
};

const rejectedState: ApplicationState = {
	status: "rejected",
	applicationId: APP_ID,
	applicantId: APPLICANT_ID,
	reason: "identity_mismatch",
};

const flaggedState: ApplicationState = {
	status: "flagged",
	applicationId: APP_ID,
	applicantId: APPLICANT_ID,
	lotteryName: MONTH,
	reason: "Phone matches but name differs",
};

function makeSubmitCommand(overrides?: {
	identityResolution?: Parameters<typeof decide>[0] extends {
		type: "SubmitApplication";
		data: infer D;
	}
		? D["identityResolution"]
		: never;
	eligibility?: Parameters<typeof decide>[0] extends {
		type: "SubmitApplication";
		data: infer D;
	}
		? D["eligibility"]
		: never;
}) {
	return {
		type: "SubmitApplication" as const,
		data: {
			applicationId: APP_ID,
			identity: { phone: "07700900000", name: "Jane Doe" },
			paymentPreference: "bank" as const,
			meetingDetails: { place: "Town Hall" },
			lotteryName: MONTH,
			identityResolution: overrides?.identityResolution ?? {
				type: "new" as const,
			},
			eligibility: overrides?.eligibility ?? { status: "eligible" as const },
			submittedAt: NOW,
		},
	};
}

describe("application decider", () => {
	describe("SubmitApplication", () => {
		it("emits ApplicationSubmitted + ApplicationAccepted for new eligible applicant", () => {
			const events = decide(makeSubmitCommand(), initialState());

			expect(events).toHaveLength(2);
			expect(events[0]?.type).toBe("ApplicationSubmitted");
			expect(events[1]?.type).toBe("ApplicationAccepted");
		});

		it("derives applicantId from phone+name for new identity", () => {
			const events = decide(makeSubmitCommand(), initialState());

			expect(events[0]?.data).toMatchObject({ applicantId: APPLICANT_ID });
		});

		it("uses matched applicantId from identity resolution", () => {
			const events = decide(
				makeSubmitCommand({
					identityResolution: { type: "matched", applicantId: "existing-id" },
				}),
				initialState(),
			);

			expect(events[0]?.data).toMatchObject({ applicantId: "existing-id" });
		});

		it("emits ApplicationSubmitted + ApplicationFlaggedForReview for flagged identity", () => {
			const events = decide(
				makeSubmitCommand({
					identityResolution: {
						type: "flagged",
						applicantId: "existing-id",
						reason: "Phone matches but name differs",
					},
				}),
				initialState(),
			);

			expect(events).toHaveLength(2);
			expect(events[0]?.type).toBe("ApplicationSubmitted");
			expect(events[1]?.type).toBe("ApplicationFlaggedForReview");
		});

		it("emits ApplicationRejected for cooldown", () => {
			const events = decide(
				makeSubmitCommand({
					eligibility: { status: "cooldown", lastGrantMonth: "2025-11" },
				}),
				initialState(),
			);

			expect(events).toHaveLength(2);
			expect(events[1]?.type).toBe("ApplicationRejected");
			expect(events[1]?.data).toMatchObject({ reason: "cooldown" });
		});

		it("emits ApplicationRejected for duplicate", () => {
			const events = decide(
				makeSubmitCommand({ eligibility: { status: "duplicate" } }),
				initialState(),
			);

			expect(events[1]?.type).toBe("ApplicationRejected");
			expect(events[1]?.data).toMatchObject({ reason: "duplicate" });
		});

		it("emits ApplicationRejected for window_closed", () => {
			const events = decide(
				makeSubmitCommand({ eligibility: { status: "window_closed" } }),
				initialState(),
			);

			expect(events[1]?.type).toBe("ApplicationRejected");
			expect(events[1]?.data).toMatchObject({ reason: "window_closed" });
		});

		it("throws when application already exists", () => {
			expect(() => decide(makeSubmitCommand(), acceptedState)).toThrow(
				IllegalStateError,
			);
		});
	});

	describe("ReviewApplication", () => {
		it("emits ApplicationConfirmed when confirmed and eligible", () => {
			const events = decide(
				{
					type: "ReviewApplication",
					data: {
						applicationId: APP_ID,
						volunteerId: "vol-1",
						decision: "confirm",
						eligibility: { status: "eligible" },
						reviewedAt: NOW,
					},
				},
				flaggedState,
			);

			expect(events).toHaveLength(1);
			expect(events[0]?.type).toBe("ApplicationConfirmed");
		});

		it("uses confirmedApplicantId when provided", () => {
			const events = decide(
				{
					type: "ReviewApplication",
					data: {
						applicationId: APP_ID,
						volunteerId: "vol-1",
						decision: "confirm",
						eligibility: { status: "eligible" },
						reviewedAt: NOW,
						confirmedApplicantId: "correct-id",
					},
				},
				flaggedState,
			);

			expect(events[0]?.data).toMatchObject({ applicantId: "correct-id" });
		});

		it("emits ApplicationRejected when decision is reject", () => {
			const events = decide(
				{
					type: "ReviewApplication",
					data: {
						applicationId: APP_ID,
						volunteerId: "vol-1",
						decision: "reject",
						eligibility: { status: "eligible" },
						reviewedAt: NOW,
					},
				},
				flaggedState,
			);

			expect(events).toHaveLength(1);
			expect(events[0]?.type).toBe("ApplicationRejected");
			expect(events[0]?.data).toMatchObject({ reason: "identity_mismatch" });
		});

		it("emits ApplicationRejected when confirmed but in cooldown", () => {
			const events = decide(
				{
					type: "ReviewApplication",
					data: {
						applicationId: APP_ID,
						volunteerId: "vol-1",
						decision: "confirm",
						eligibility: { status: "cooldown", lastGrantMonth: "2025-11" },
						reviewedAt: NOW,
					},
				},
				flaggedState,
			);

			expect(events[0]?.type).toBe("ApplicationRejected");
			expect(events[0]?.data).toMatchObject({ reason: "cooldown" });
		});

		it("emits ApplicationConfirmed when confirming from accepted state", () => {
			const events = decide(
				{
					type: "ReviewApplication",
					data: {
						applicationId: APP_ID,
						volunteerId: "vol-1",
						decision: "confirm",
						eligibility: { status: "eligible" },
						reviewedAt: NOW,
					},
				},
				acceptedState,
			);

			expect(events).toHaveLength(1);
			expect(events[0]?.type).toBe("ApplicationConfirmed");
		});

		it("emits ApplicationRejected when rejecting from accepted state", () => {
			const events = decide(
				{
					type: "ReviewApplication",
					data: {
						applicationId: APP_ID,
						volunteerId: "vol-1",
						decision: "reject",
						eligibility: { status: "eligible" },
						reviewedAt: NOW,
					},
				},
				acceptedState,
			);

			expect(events).toHaveLength(1);
			expect(events[0]?.type).toBe("ApplicationRejected");
			expect(events[0]?.data).toMatchObject({ reason: "identity_mismatch" });
		});

		it("throws when application is in submitted state", () => {
			expect(() =>
				decide(
					{
						type: "ReviewApplication",
						data: {
							applicationId: APP_ID,
							volunteerId: "vol-1",
							decision: "confirm",
							eligibility: { status: "eligible" },
							reviewedAt: NOW,
						},
					},
					{
						status: "submitted",
						applicationId: APP_ID,
						applicantId: APPLICANT_ID,
						lotteryName: MONTH,
					},
				),
			).toThrow(IllegalStateError);
		});
	});

	describe("SelectApplication", () => {
		it("emits ApplicationSelected from accepted state", () => {
			const events = decide(
				{
					type: "SelectApplication",
					data: {
						applicationId: APP_ID,
						lotteryName: MONTH,
						rank: 1,
						selectedAt: NOW,
					},
				},
				acceptedState,
			);

			expect(events).toHaveLength(1);
			expect(events[0]?.type).toBe("ApplicationSelected");
			expect(events[0]?.data).toMatchObject({ rank: 1 });
		});

		it("emits ApplicationSelected from confirmed state", () => {
			const events = decide(
				{
					type: "SelectApplication",
					data: {
						applicationId: APP_ID,
						lotteryName: MONTH,
						rank: 2,
						selectedAt: NOW,
					},
				},
				{
					status: "confirmed",
					applicationId: APP_ID,
					applicantId: APPLICANT_ID,
					lotteryName: MONTH,
				},
			);

			expect(events[0]?.type).toBe("ApplicationSelected");
		});

		it("throws from submitted state", () => {
			expect(() =>
				decide(
					{
						type: "SelectApplication",
						data: {
							applicationId: APP_ID,
							lotteryName: MONTH,
							rank: 1,
							selectedAt: NOW,
						},
					},
					{
						status: "submitted",
						applicationId: APP_ID,
						applicantId: APPLICANT_ID,
						lotteryName: MONTH,
					},
				),
			).toThrow(IllegalStateError);
		});
	});

	describe("RejectFromLottery", () => {
		it("emits ApplicationNotSelected from accepted state", () => {
			const events = decide(
				{
					type: "RejectFromLottery",
					data: {
						applicationId: APP_ID,
						lotteryName: MONTH,
						rejectedAt: NOW,
					},
				},
				acceptedState,
			);

			expect(events).toHaveLength(1);
			expect(events[0]?.type).toBe("ApplicationNotSelected");
		});

		it("throws from submitted state", () => {
			expect(() =>
				decide(
					{
						type: "RejectFromLottery",
						data: {
							applicationId: APP_ID,
							lotteryName: MONTH,
							rejectedAt: NOW,
						},
					},
					{
						status: "submitted",
						applicationId: APP_ID,
						applicantId: APPLICANT_ID,
						lotteryName: MONTH,
					},
				),
			).toThrow(IllegalStateError);
		});
	});

	describe("RevertReviewApplication", () => {
		it("emits ApplicationReviewReverted from confirmed state", () => {
			const events = decide(
				{
					type: "RevertReviewApplication",
					data: {
						applicationId: APP_ID,
						volunteerId: "vol-1",
						revertedAt: NOW,
					},
				},
				confirmedState,
			);

			expect(events).toHaveLength(1);
			expect(events[0]?.type).toBe("ApplicationReviewReverted");
			expect(events[0]?.data).toMatchObject({
				applicationId: APP_ID,
				volunteerId: "vol-1",
			});
		});

		it("emits ApplicationReviewReverted from rejected state", () => {
			const events = decide(
				{
					type: "RevertReviewApplication",
					data: {
						applicationId: APP_ID,
						volunteerId: "vol-1",
						revertedAt: NOW,
					},
				},
				rejectedState,
			);

			expect(events).toHaveLength(1);
			expect(events[0]?.type).toBe("ApplicationReviewReverted");
		});

		it("throws from flagged state", () => {
			expect(() =>
				decide(
					{
						type: "RevertReviewApplication",
						data: {
							applicationId: APP_ID,
							volunteerId: "vol-1",
							revertedAt: NOW,
						},
					},
					flaggedState,
				),
			).toThrow(IllegalStateError);
		});

		it("throws from accepted state", () => {
			expect(() =>
				decide(
					{
						type: "RevertReviewApplication",
						data: {
							applicationId: APP_ID,
							volunteerId: "vol-1",
							revertedAt: NOW,
						},
					},
					acceptedState,
				),
			).toThrow(IllegalStateError);
		});

		it("throws from initial state", () => {
			expect(() =>
				decide(
					{
						type: "RevertReviewApplication",
						data: {
							applicationId: APP_ID,
							volunteerId: "vol-1",
							revertedAt: NOW,
						},
					},
					initialState(),
				),
			).toThrow(IllegalStateError);
		});
	});

	describe("evolve", () => {
		it("transitions to submitted after ApplicationSubmitted", () => {
			const state = evolve(initialState(), {
				type: "ApplicationSubmitted",
				data: {
					applicationId: APP_ID,
					applicantId: APPLICANT_ID,
					identity: { phone: "07700900000", name: "Jane Doe" },
					paymentPreference: "bank",
					meetingDetails: { place: "Town Hall" },
					lotteryName: MONTH,
					submittedAt: NOW,
				},
			});

			expect(state.status).toBe("submitted");
		});

		it("transitions to accepted after ApplicationAccepted", () => {
			const state = evolve(
				{
					status: "submitted",
					applicationId: APP_ID,
					applicantId: APPLICANT_ID,
					lotteryName: MONTH,
				},
				{
					type: "ApplicationAccepted",
					data: {
						applicationId: APP_ID,
						applicantId: APPLICANT_ID,
						lotteryName: MONTH,
						acceptedAt: NOW,
					},
				},
			);

			expect(state.status).toBe("accepted");
		});

		it("transitions to selected after ApplicationSelected", () => {
			const state = evolve(acceptedState, {
				type: "ApplicationSelected",
				data: {
					applicationId: APP_ID,
					applicantId: APPLICANT_ID,
					lotteryName: MONTH,
					rank: 3,
					selectedAt: NOW,
				},
			});

			expect(state.status).toBe("selected");
			if (state.status === "selected") {
				expect(state.rank).toBe(3);
			}
		});

		it("transitions to not_selected after ApplicationNotSelected", () => {
			const state = evolve(acceptedState, {
				type: "ApplicationNotSelected",
				data: {
					applicationId: APP_ID,
					applicantId: APPLICANT_ID,
					lotteryName: MONTH,
					notSelectedAt: NOW,
				},
			});

			expect(state.status).toBe("not_selected");
		});

		it("transitions to flagged after ApplicationReviewReverted", () => {
			const state = evolve(confirmedState, {
				type: "ApplicationReviewReverted",
				data: {
					applicationId: APP_ID,
					applicantId: APPLICANT_ID,
					volunteerId: "vol-1",
					lotteryName: MONTH,
					reason: "Reverted previous confirmed decision",
					revertedAt: NOW,
				},
			});

			expect(state.status).toBe("flagged");
			if (state.status === "flagged") {
				expect(state.reason).toBe("Reverted previous confirmed decision");
			}
		});
	});
});
