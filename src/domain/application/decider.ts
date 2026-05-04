import { IllegalStateError } from "@event-driven-io/emmett";
import { toApplicantId } from "./applicantId.ts";
import type {
	ApplicationEvent,
	ApplicationState,
	CancelApplicationDueToLottery,
	IdentityResolution,
	RejectFromLottery,
	RevertReviewApplication,
	ReviewApplication,
	SelectApplication,
	SubmitApplication,
} from "./types.ts";

export type ApplicationCommand =
	| SubmitApplication
	| ReviewApplication
	| SelectApplication
	| RejectFromLottery
	| CancelApplicationDueToLottery
	| RevertReviewApplication;

export const initialState = (): ApplicationState => ({ status: "initial" });

function formatDate(iso: string): string {
	return new Date(iso).toLocaleDateString("en-GB", {
		day: "numeric",
		month: "long",
		year: "numeric",
	});
}

function resolveApplicantId(
	resolution: IdentityResolution,
	data: { phone: string; name: string },
): string {
	switch (resolution.type) {
		case "new":
			return toApplicantId(data.phone, data.name);
		case "matched":
		case "flagged":
			return resolution.applicantId;
	}
}

export function decide(
	command: ApplicationCommand,
	state: ApplicationState,
): ApplicationEvent[] {
	switch (command.type) {
		case "SubmitApplication":
			return decideSubmit(command, state);
		case "ReviewApplication":
			return decideReview(command, state);
		case "SelectApplication":
			return decideSelect(command, state);
		case "RejectFromLottery":
			return decideRejectFromLottery(command, state);
		case "ApplicationLotteryCancelled":
			return decideCancelDueToLottery(
				command as unknown as CancelApplicationDueToLottery,
				state,
			);
		case "RevertReviewApplication":
			return decideRevertReview(command, state);
	}
}

function decideSubmit(
	command: SubmitApplication,
	state: ApplicationState,
): ApplicationEvent[] {
	if (state.status !== "initial") {
		throw new IllegalStateError(
			`Application already submitted (status: ${state.status})`,
		);
	}

	const { data } = command;
	const applicantId = resolveApplicantId(
		data.identityResolution,
		data.identity,
	);
	const now = data.submittedAt;

	const submitted: ApplicationEvent = {
		type: "ApplicationSubmitted",
		data: {
			applicationId: data.applicationId,
			applicantId,
			identity: data.identity,
			paymentPreference: data.paymentPreference,
			meetingDetails: data.meetingDetails,
			lotteryName: data.lotteryName,
			submittedAt: now,
			bankDetails: data.bankDetails,
		},
	};

	// Flagged identity — skip eligibility, route to volunteer review
	if (data.identityResolution.type === "flagged") {
		return [
			submitted,
			{
				type: "ApplicationFlaggedForReview",
				data: {
					applicationId: data.applicationId,
					applicantId,
					reason: data.identityResolution.reason,
					lotteryName: data.lotteryName,
					flaggedAt: now,
				},
			},
		];
	}

	// Eligible — accepted
	if (data.eligibility.status === "eligible") {
		if (data.autoApproveEnabled === false) {
			return [
				submitted,
				{
					type: "ApplicationFlaggedForReview",
					data: {
						applicationId: data.applicationId,
						applicantId,
						reason: "Auto-approval disabled",
						lotteryName: data.lotteryName,
						flaggedAt: now,
					},
				},
			];
		}

		return [
			submitted,
			{
				type: "ApplicationAccepted",
				data: {
					applicationId: data.applicationId,
					applicantId,
					lotteryName: data.lotteryName,
					acceptedAt: now,
				},
			},
		];
	}

	// Not eligible — rejected
	const detail =
		data.eligibility.status === "cooldown"
			? `Eligible again after ${formatDate(data.eligibility.eligibleAfter)}`
			: data.eligibility.status === "duplicate"
				? "Already applied this month"
				: "Application window is not open";

	return [
		submitted,
		{
			type: "ApplicationRejected",
			data: {
				applicationId: data.applicationId,
				applicantId,
				reason: data.eligibility.status,
				detail,
				lotteryName: data.lotteryName,
				rejectedAt: now,
			},
		},
	];
}

function decideReview(
	command: ReviewApplication,
	state: ApplicationState,
): ApplicationEvent[] {
	if (state.status !== "flagged" && state.status !== "accepted") {
		throw new IllegalStateError(
			`Cannot review application in ${state.status} state`,
		);
	}

	const { data } = command;

	if (data.decision === "reject") {
		return [
			{
				type: "ApplicationRejected",
				data: {
					applicationId: state.applicationId,
					applicantId: state.applicantId,
					reason: "identity_mismatch",
					detail: "Rejected by volunteer review",
					volunteerId: data.volunteerId,
					lotteryName: state.lotteryName,
					rejectedAt: data.reviewedAt,
				},
			},
		];
	}

	// Confirmed — still need eligibility check
	if (data.eligibility.status === "eligible") {
		return [
			{
				type: "ApplicationConfirmed",
				data: {
					applicationId: state.applicationId,
					applicantId: data.confirmedApplicantId ?? state.applicantId,
					volunteerId: data.volunteerId,
					lotteryName: state.lotteryName,
					confirmedAt: data.reviewedAt,
				},
			},
		];
	}

	const detail =
		data.eligibility.status === "cooldown"
			? `Eligible again after ${formatDate(data.eligibility.eligibleAfter)}`
			: data.eligibility.status === "duplicate"
				? "Already applied this month"
				: "Application window is not open";

	return [
		{
			type: "ApplicationRejected",
			data: {
				applicationId: state.applicationId,
				applicantId: data.confirmedApplicantId ?? state.applicantId,
				reason: data.eligibility.status,
				detail,
				volunteerId: data.volunteerId,
				lotteryName: state.lotteryName,
				rejectedAt: data.reviewedAt,
			},
		},
	];
}

function decideSelect(
	command: SelectApplication,
	state: ApplicationState,
): ApplicationEvent[] {
	if (
		state.status !== "accepted" &&
		state.status !== "confirmed" &&
		state.status !== "not_selected"
	) {
		throw new IllegalStateError(
			`Cannot select application in ${state.status} state`,
		);
	}
	return [
		{
			type: "ApplicationSelected",
			data: {
				applicationId: state.applicationId,
				applicantId: state.applicantId,
				lotteryName: state.lotteryName,
				rank: command.data.rank,
				selectedAt: command.data.selectedAt,
			},
		},
	];
}

function decideRejectFromLottery(
	command: RejectFromLottery,
	state: ApplicationState,
): ApplicationEvent[] {
	if (state.status !== "accepted" && state.status !== "confirmed") {
		throw new IllegalStateError(
			`Cannot reject application from lottery in ${state.status} state`,
		);
	}
	return [
		{
			type: "ApplicationNotSelected",
			data: {
				applicationId: state.applicationId,
				applicantId: state.applicantId,
				lotteryName: state.lotteryName,
				notSelectedAt: command.data.rejectedAt,
			},
		},
	];
}

function decideCancelDueToLottery(
	command: CancelApplicationDueToLottery,
	state: ApplicationState,
): ApplicationEvent[] {
	if (
		state.status !== "accepted" &&
		state.status !== "confirmed" &&
		state.status !== "flagged"
	) {
		throw new IllegalStateError(
			`Cannot cancel application due to lottery cancellation in ${state.status} state`,
		);
	}
	return [
		{
			type: "ApplicationLotteryCancelled",
			data: {
				applicationId: state.applicationId,
				lotteryName: command.data.lotteryName,
				previousStatus: state.status,
				cancelledAt: command.data.cancelledAt,
			},
		},
	];
}

function decideRevertReview(
	command: RevertReviewApplication,
	state: ApplicationState,
): ApplicationEvent[] {
	if (state.status !== "confirmed" && state.status !== "rejected") {
		throw new IllegalStateError(
			`Cannot revert review in ${state.status} state`,
		);
	}

	const previousDecision =
		state.status === "confirmed" ? "confirmed" : "rejected";

	return [
		{
			type: "ApplicationReviewReverted",
			data: {
				applicationId: state.applicationId,
				applicantId: state.applicantId,
				volunteerId: command.data.volunteerId,
				lotteryName: state.lotteryName,
				reason: `Reverted previous ${previousDecision} decision`,
				revertedAt: command.data.revertedAt,
			},
		},
	];
}

export function evolve(
	state: ApplicationState,
	event: ApplicationEvent,
): ApplicationState {
	switch (event.type) {
		case "ApplicationSubmitted":
			return {
				status: "submitted",
				applicationId: event.data.applicationId,
				applicantId: event.data.applicantId,
				lotteryName: event.data.lotteryName,
			};
		case "ApplicationAccepted":
			return {
				status: "accepted",
				applicationId: event.data.applicationId,
				applicantId: event.data.applicantId,
				lotteryName: event.data.lotteryName,
			};
		case "ApplicationConfirmed":
			return {
				status: "confirmed",
				applicationId: event.data.applicationId,
				applicantId: event.data.applicantId,
				lotteryName: event.data.lotteryName,
			};
		case "ApplicationRejected":
			return {
				status: "rejected",
				applicationId: event.data.applicationId,
				applicantId: event.data.applicantId,
				reason: event.data.reason,
			};
		case "ApplicationFlaggedForReview":
			return {
				status: "flagged",
				applicationId: event.data.applicationId,
				applicantId: event.data.applicantId,
				lotteryName: event.data.lotteryName,
				reason: event.data.reason,
			};
		case "ApplicationSelected":
			return {
				status: "selected",
				applicationId: event.data.applicationId,
				applicantId: event.data.applicantId,
				lotteryName: event.data.lotteryName,
				rank: event.data.rank,
			};
		case "ApplicationNotSelected":
			return {
				status: "not_selected",
				applicationId: event.data.applicationId,
				applicantId: event.data.applicantId,
				lotteryName: event.data.lotteryName,
			};
		case "ApplicationLotteryCancelled":
			return {
				status: "cancelled",
				applicationId: event.data.applicationId,
			};
		case "ApplicationReviewReverted":
			return {
				status: "flagged",
				applicationId: event.data.applicationId,
				applicantId: event.data.applicantId,
				lotteryName: event.data.lotteryName,
				reason: event.data.reason,
			};
		default: {
			const _exhaustive: never = event;
			return state;
		}
	}
}
