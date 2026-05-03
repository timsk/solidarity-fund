import type { Command, Event } from "@event-driven-io/emmett";

// Value Objects

export type PaymentPreference = "bank" | "cash";

export type BankDetails = {
	sortCode: string;
	accountNumber: string;
	proofOfAddressRef: string;
};

export type MeetingDetails = {
	place?: string;
};

export type ApplicantIdentity = {
	phone: string;
	name: string;
	email?: string;
};

export type IdentityResolution =
	| { type: "new" }
	| { type: "matched"; applicantId: string }
	| { type: "flagged"; applicantId: string; reason: string };

export type EligibilityResult =
	| { status: "eligible" }
	| {
			status: "cooldown";
			lastGrantSelectedAt: string;
			eligibleAfter: string;
			cooldownDays: number;
	  }
	| { status: "duplicate"; appliedAt?: string; ref?: string }
	| { status: "window_closed" };

// Commands

export type SubmitApplication = Command<
	"SubmitApplication",
	{
		applicationId: string;
		identity: ApplicantIdentity;
		paymentPreference: PaymentPreference;
		meetingDetails?: MeetingDetails;
		lotteryName: string;
		identityResolution: IdentityResolution;
		eligibility: EligibilityResult;
		submittedAt: string;
		bankDetails?: BankDetails;
	}
>;

export type ReviewApplication = Command<
	"ReviewApplication",
	{
		applicationId: string;
		volunteerId: string;
		decision: "confirm" | "reject";
		eligibility: EligibilityResult;
		reviewedAt: string;
		confirmedApplicantId?: string;
	}
>;

export type SelectApplication = Command<
	"SelectApplication",
	{
		applicationId: string;
		lotteryName: string;
		rank: number;
		selectedAt: string;
	}
>;

export type RejectFromLottery = Command<
	"RejectFromLottery",
	{
		applicationId: string;
		lotteryName: string;
		rejectedAt: string;
	}
>;

export type CancelApplicationDueToLottery = Command<
	"ApplicationLotteryCancelled",
	{
		applicationId: string;
		lotteryName: string;
		cancelledAt: string;
	}
>;

export type RevertReviewApplication = Command<
	"RevertReviewApplication",
	{
		applicationId: string;
		volunteerId: string;
		revertedAt: string;
	}
>;

// Events

export type ApplicationSubmitted = Event<
	"ApplicationSubmitted",
	{
		applicationId: string;
		applicantId: string;
		identity: ApplicantIdentity;
		paymentPreference: PaymentPreference;
		meetingDetails?: MeetingDetails;
		lotteryName: string;
		submittedAt: string;
		bankDetails?: BankDetails;
	}
>;

export type ApplicationAccepted = Event<
	"ApplicationAccepted",
	{
		applicationId: string;
		applicantId: string;
		lotteryName: string;
		acceptedAt: string;
	}
>;

export type ApplicationConfirmed = Event<
	"ApplicationConfirmed",
	{
		applicationId: string;
		applicantId: string;
		volunteerId: string;
		lotteryName: string;
		confirmedAt: string;
	}
>;

export type ApplicationRejected = Event<
	"ApplicationRejected",
	{
		applicationId: string;
		applicantId: string;
		reason: "cooldown" | "duplicate" | "identity_mismatch" | "window_closed";
		detail: string;
		volunteerId?: string;
		lotteryName: string;
		rejectedAt: string;
	}
>;

export type ApplicationFlaggedForReview = Event<
	"ApplicationFlaggedForReview",
	{
		applicationId: string;
		applicantId: string;
		reason: string;
		lotteryName: string;
		flaggedAt: string;
	}
>;

export type ApplicationSelected = Event<
	"ApplicationSelected",
	{
		applicationId: string;
		applicantId: string;
		lotteryName: string;
		rank: number;
		selectedAt: string;
	}
>;

export type ApplicationNotSelected = Event<
	"ApplicationNotSelected",
	{
		applicationId: string;
		applicantId: string;
		lotteryName: string;
		notSelectedAt: string;
	}
>;

export type ApplicationLotteryCancelled = Event<
	"ApplicationLotteryCancelled",
	{
		applicationId: string;
		lotteryName: string;
		previousStatus: string;
		cancelledAt: string;
	}
>;

export type ApplicationReviewReverted = Event<
	"ApplicationReviewReverted",
	{
		applicationId: string;
		applicantId: string;
		volunteerId: string;
		lotteryName: string;
		reason: string;
		revertedAt: string;
	}
>;

export type ApplicationCommand =
	| SubmitApplication
	| ReviewApplication
	| SelectApplication
	| RejectFromLottery
	| CancelApplicationDueToLottery
	| RevertReviewApplication;

export type ApplicationEvent =
	| ApplicationSubmitted
	| ApplicationAccepted
	| ApplicationConfirmed
	| ApplicationRejected
	| ApplicationFlaggedForReview
	| ApplicationSelected
	| ApplicationNotSelected
	| ApplicationLotteryCancelled
	| ApplicationReviewReverted;

export type ApplicationEventType = ApplicationEvent["type"];

// State

export type ApplicationState =
	| { status: "initial" }
	| {
			status: "submitted";
			applicationId: string;
			applicantId: string;
			lotteryName: string;
	  }
	| {
			status: "accepted";
			applicationId: string;
			applicantId: string;
			lotteryName: string;
	  }
	| {
			status: "rejected";
			applicationId: string;
			applicantId: string;
			reason: string;
	  }
	| {
			status: "confirmed";
			applicationId: string;
			applicantId: string;
			lotteryName: string;
	  }
	| {
			status: "flagged";
			applicationId: string;
			applicantId: string;
			lotteryName: string;
			reason: string;
	  }
	| {
			status: "selected";
			applicationId: string;
			applicantId: string;
			lotteryName: string;
			rank: number;
	  }
	| {
			status: "not_selected";
			applicationId: string;
			applicantId: string;
			lotteryName: string;
	  }
	| {
			status: "cancelled";
			applicationId: string;
	  };
