import { IllegalStateError } from "@event-driven-io/emmett";
import type {
	AcceptCashAlternative,
	ApproveProofOfAddress,
	AssignVolunteer,
	CreateGrant,
	DeclineCashAlternative,
	GrantCommand,
	GrantEvent,
	GrantState,
	RecordPayment,
	RecordReimbursement,
	RejectProofOfAddress,
	ReleaseSlot,
	UpdateBankDetails,
} from "./types.ts";

export const initialState = (): GrantState => ({ status: "initial" });

export function decide(command: GrantCommand, state: GrantState): GrantEvent[] {
	switch (command.type) {
		case "CreateGrant":
			return decideCreate(command, state);
		case "AssignVolunteer":
			return decideAssignVolunteer(command, state);
		case "UpdateBankDetails":
			return decideUpdateBankDetails(command, state);
		case "ApproveProofOfAddress":
			return decideApprovePoA(command, state);
		case "RejectProofOfAddress":
			return decideRejectPoA(command, state);
		case "AcceptCashAlternative":
			return decideAcceptCashAlt(command, state);
		case "DeclineCashAlternative":
			return decideDeclineCashAlt(command, state);
		case "RecordPayment":
			return decideRecordPayment(command, state);
		case "ReleaseSlot":
			return decideReleaseSlot(command, state);
		case "RecordReimbursement":
			return decideRecordReimbursement(command, state);
	}
}

function decideCreate(command: CreateGrant, state: GrantState): GrantEvent[] {
	if (state.status !== "initial") {
		throw new IllegalStateError(
			`Grant already created (status: ${state.status})`,
		);
	}
	return [{ type: "GrantCreated", data: { ...command.data } }];
}

function isNonTerminal(state: GrantState): state is GrantState & {
	status:
		| "awaiting_review"
		| "poa_approved"
		| "offered_cash_alternative"
		| "awaiting_cash_handover";
} {
	return (
		state.status !== "initial" &&
		state.status !== "paid" &&
		state.status !== "awaiting_reimbursement" &&
		state.status !== "reimbursed" &&
		state.status !== "released"
	);
}

function decideAssignVolunteer(
	command: AssignVolunteer,
	state: GrantState,
): GrantEvent[] {
	if (!isNonTerminal(state)) {
		throw new IllegalStateError(
			`Cannot assign volunteer in ${state.status} state`,
		);
	}
	return [
		{
			type: "VolunteerAssigned",
			data: { ...command.data },
		},
	];
}

function decideUpdateBankDetails(
	command: UpdateBankDetails,
	state: GrantState,
): GrantEvent[] {
	if (state.status !== "awaiting_review") {
		throw new IllegalStateError(
			`Cannot update bank details in ${state.status} state`,
		);
	}
	return [
		{
			type: "BankDetailsUpdated",
			data: { ...command.data },
		},
	];
}

function decideApprovePoA(
	command: ApproveProofOfAddress,
	state: GrantState,
): GrantEvent[] {
	if (state.status !== "awaiting_review") {
		throw new IllegalStateError(
			`Cannot approve proof of address in ${state.status} state`,
		);
	}
	return [
		{
			type: "ProofOfAddressApproved",
			data: { ...command.data },
		},
	];
}

function decideRejectPoA(
	command: RejectProofOfAddress,
	state: GrantState,
): GrantEvent[] {
	if (state.status !== "awaiting_review") {
		throw new IllegalStateError(
			`Cannot reject proof of address in ${state.status} state`,
		);
	}

	const attempt = state.poaAttempts;
	const events: GrantEvent[] = [
		{
			type: "ProofOfAddressRejected",
			data: {
				grantId: command.data.grantId,
				reason: command.data.reason,
				attempt,
				rejectedBy: command.data.rejectedBy,
				rejectedAt: command.data.rejectedAt,
			},
		},
	];

	if (attempt >= 2) {
		events.push({
			type: "CashAlternativeOffered",
			data: {
				grantId: command.data.grantId,
				offeredAt: command.data.rejectedAt,
			},
		});
	}

	return events;
}

function decideAcceptCashAlt(
	command: AcceptCashAlternative,
	state: GrantState,
): GrantEvent[] {
	if (state.status !== "offered_cash_alternative") {
		throw new IllegalStateError(
			`Cannot accept cash alternative in ${state.status} state`,
		);
	}
	return [
		{
			type: "CashAlternativeAccepted",
			data: { ...command.data },
		},
	];
}

function decideDeclineCashAlt(
	command: DeclineCashAlternative,
	state: GrantState,
): GrantEvent[] {
	if (state.status !== "offered_cash_alternative") {
		throw new IllegalStateError(
			`Cannot decline cash alternative in ${state.status} state`,
		);
	}
	return [
		{
			type: "CashAlternativeDeclined",
			data: { ...command.data },
		},
		{
			type: "SlotReleased",
			data: {
				grantId: state.grantId,
				applicationId: state.applicationId,
				applicantId: state.applicantId,
				lotteryName: state.lotteryName,
				reason: "Cash alternative declined",
				releasedBy: "system",
				releasedAt: command.data.declinedAt,
			},
		},
	];
}

function decideRecordPayment(
	command: RecordPayment,
	state: GrantState,
): GrantEvent[] {
	if (
		state.status !== "poa_approved" &&
		state.status !== "awaiting_cash_handover"
	) {
		throw new IllegalStateError(
			`Cannot record payment in ${state.status} state`,
		);
	}
	if (!state.volunteerId) {
		throw new IllegalStateError(
			"Cannot record payment without an assigned volunteer",
		);
	}
	if (state.status === "poa_approved" && command.data.method !== "bank") {
		throw new IllegalStateError(
			"POA-approved grants must be paid by bank transfer",
		);
	}
	if (
		state.status === "awaiting_cash_handover" &&
		command.data.method !== "cash"
	) {
		throw new IllegalStateError("Cash handover grants must be paid in cash");
	}
	return [
		{
			type: "GrantPaid",
			data: {
				grantId: command.data.grantId,
				applicationId: state.applicationId,
				applicantId: state.applicantId,
				lotteryName: state.lotteryName,
				amount: command.data.amount,
				method: command.data.method,
				paidBy: command.data.paidBy,
				paidAt: command.data.paidAt,
			},
		},
	];
}

function decideRecordReimbursement(
	command: RecordReimbursement,
	state: GrantState,
): GrantEvent[] {
	if (state.status !== "awaiting_reimbursement") {
		throw new IllegalStateError(
			`Cannot record reimbursement in ${state.status} state`,
		);
	}
	return [
		{
			type: "VolunteerReimbursed",
			data: { ...command.data },
		},
	];
}

function decideReleaseSlot(
	command: ReleaseSlot,
	state: GrantState,
): GrantEvent[] {
	if (!isNonTerminal(state)) {
		throw new IllegalStateError(`Cannot release slot in ${state.status} state`);
	}
	return [
		{
			type: "SlotReleased",
			data: {
				grantId: state.grantId,
				applicationId: state.applicationId,
				applicantId: state.applicantId,
				lotteryName: state.lotteryName,
				reason: command.data.reason,
				releasedBy: command.data.releasedBy,
				releasedAt: command.data.releasedAt,
			},
		},
	];
}

export function evolve(state: GrantState, event: GrantEvent): GrantState {
	switch (event.type) {
		case "GrantCreated": {
			const coreData = {
				grantId: event.data.grantId,
				applicationId: event.data.applicationId,
				applicantId: event.data.applicantId,
				lotteryName: event.data.lotteryName,
				rank: event.data.rank,
			};
			if (event.data.paymentPreference === "cash") {
				return { ...coreData, status: "awaiting_cash_handover" };
			}
			const { bankDetails } = event.data;
			return {
				...coreData,
				status: "awaiting_review",
				sortCode: bankDetails?.sortCode ?? "",
				accountNumber: bankDetails?.accountNumber ?? "",
				proofOfAddressRef: bankDetails?.proofOfAddressRef ?? "",
				poaAttempts: 0,
			};
		}
		case "VolunteerAssigned": {
			if (state.status === "initial") return state;
			return { ...state, volunteerId: event.data.volunteerId };
		}
		case "BankDetailsUpdated": {
			if (state.status !== "awaiting_review") return state;
			return {
				...state,
				sortCode: event.data.sortCode,
				accountNumber: event.data.accountNumber,
			};
		}
		case "ProofOfAddressApproved": {
			if (state.status !== "awaiting_review") return state;
			return {
				grantId: state.grantId,
				applicationId: state.applicationId,
				applicantId: state.applicantId,
				lotteryName: state.lotteryName,
				rank: state.rank,
				volunteerId: state.volunteerId,
				status: "poa_approved",
				poaAttempts: state.poaAttempts,
			};
		}
		case "ProofOfAddressRejected": {
			if (state.status !== "awaiting_review") return state;
			return {
				...state,
				poaAttempts: state.poaAttempts + 1,
			};
		}
		case "CashAlternativeOffered": {
			if (state.status === "initial") return state;
			return {
				grantId: state.grantId,
				applicationId: state.applicationId,
				applicantId: state.applicantId,
				lotteryName: state.lotteryName,
				rank: state.rank,
				volunteerId: state.volunteerId,
				status: "offered_cash_alternative",
			};
		}
		case "CashAlternativeAccepted": {
			if (state.status !== "offered_cash_alternative") return state;
			return {
				grantId: state.grantId,
				applicationId: state.applicationId,
				applicantId: state.applicantId,
				lotteryName: state.lotteryName,
				rank: state.rank,
				volunteerId: state.volunteerId,
				status: "awaiting_cash_handover",
			};
		}
		case "CashAlternativeDeclined": {
			// No-op — SlotReleased follows immediately
			return state;
		}
		case "GrantPaid": {
			if (state.status === "initial") return state;
			const base = {
				grantId: state.grantId,
				applicationId: state.applicationId,
				applicantId: state.applicantId,
				lotteryName: state.lotteryName,
				rank: state.rank,
				volunteerId: state.volunteerId,
				amount: event.data.amount,
				paidBy: event.data.paidBy,
				paidAt: event.data.paidAt,
			};
			if (event.data.method === "cash") {
				return { ...base, status: "awaiting_reimbursement" };
			}
			return { ...base, status: "paid", method: event.data.method };
		}
		case "SlotReleased": {
			if (state.status === "initial") return state;
			return {
				grantId: state.grantId,
				applicationId: state.applicationId,
				applicantId: state.applicantId,
				lotteryName: state.lotteryName,
				rank: state.rank,
				volunteerId: state.volunteerId,
				status: "released",
				reason: event.data.reason,
				releasedAt: event.data.releasedAt,
			};
		}
		case "VolunteerReimbursed": {
			if (state.status !== "awaiting_reimbursement") return state;
			return {
				grantId: state.grantId,
				applicationId: state.applicationId,
				applicantId: state.applicantId,
				lotteryName: state.lotteryName,
				rank: state.rank,
				volunteerId: state.volunteerId,
				status: "reimbursed",
				amount: state.amount,
				paidBy: state.paidBy,
				paidAt: state.paidAt,
				expenseReference: event.data.expenseReference,
				reimbursedAt: event.data.reimbursedAt,
			};
		}
		default: {
			const _exhaustive: never = event;
			return state;
		}
	}
}
