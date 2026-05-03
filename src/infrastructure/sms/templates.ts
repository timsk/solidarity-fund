import { getBaseUrl, getFundName } from "../../config.ts";
import type {
	ApplicationEvent,
	ApplicationEventType,
} from "../../domain/application/types.ts";
import type { GrantEvent, GrantEventType } from "../../domain/grant/types.ts";

export type SmsTemplateVariables = {
	fundName: string;
	shortId: string;
	reason?: string;
	months?: number;
	statusUrl?: string;
};

export type SmsTemplate = (variables: SmsTemplateVariables) => {
	body: string;
	maxLength?: number;
};

const defaultTemplates: Record<
	ApplicationEventType | GrantEventType,
	SmsTemplate | undefined
> = {
	ApplicationSubmitted: ({ fundName, shortId, statusUrl }) => ({
		body: `Your application for ${fundName} (ID: ${shortId}) has been received.${
			statusUrl ? `\nTrack: ${statusUrl}` : ""
		}`,
	}),
	ApplicationAccepted: ({ fundName, statusUrl }) => ({
		body: `Your application for ${fundName} has been accepted. We'll be in touch with next steps.${
			statusUrl ? `\nTrack: ${statusUrl}` : ""
		}`,
	}),
	ApplicationRejected: ({ fundName, reason, statusUrl }) => ({
		body: `Your application for ${fundName} could not be approved: ${reason}.${
			statusUrl ? `\nTrack: ${statusUrl}` : ""
		}`,
	}),
	ApplicationConfirmed: undefined,
	ApplicationFlaggedForReview: undefined,
	ApplicationSelected: ({ fundName, statusUrl }) => ({
		body: `Good news — your application for ${fundName} has been selected in this month's lottery! A volunteer will contact you about receiving your grant.${
			statusUrl ? `\nTrack: ${statusUrl}` : ""
		}`,
	}),
	ApplicationNotSelected: ({ fundName, statusUrl }) => ({
		body: `Thank you for applying to ${fundName}. Unfortunately you were not selected in this month's lottery. Please apply again next month.${
			statusUrl ? `\nTrack: ${statusUrl}` : ""
		}`,
	}),
	GrantCreated: undefined,
	VolunteerAssigned: undefined,
	BankDetailsUpdated: undefined,
	ProofOfAddressApproved: undefined,
	ProofOfAddressRejected: undefined,
	CashAlternativeOffered: undefined,
	CashAlternativeAccepted: undefined,
	CashAlternativeDeclined: undefined,
	GrantPaid: ({ fundName, statusUrl }) => ({
		body: `Your grant from ${fundName} has been paid. Please let us know if you have not received it.${
			statusUrl ? `\nTrack: ${statusUrl}` : ""
		}`,
	}),
	SlotReleased: undefined,
	VolunteerReimbursed: undefined,
};

export function getSmsTemplate(eventType: string): SmsTemplate | undefined {
	return defaultTemplates[eventType as keyof typeof defaultTemplates];
}

export function getTemplateVariables(
	event: ApplicationEvent | GrantEvent,
): SmsTemplateVariables | null {
	const fundName = getFundName();
	const shortId =
		"applicationId" in event.data
			? event.data.applicationId.slice(-6)
			: (event.data.grantId?.slice(-6) ?? "");

	const applicationId =
		"applicationId" in event.data ? event.data.applicationId : undefined;

	const ref = applicationId?.slice(0, 8);
	const baseUrl = getBaseUrl();
	const statusUrl = ref && baseUrl ? `${baseUrl}/status?ref=${ref}` : undefined;

	if (event.type === "ApplicationRejected") {
		return {
			fundName,
			shortId,
			reason: formatRejectionReason(event.data.reason),
			statusUrl,
		};
	}

	return { fundName, shortId, statusUrl };
}

function formatRejectionReason(
	reason: "cooldown" | "duplicate" | "identity_mismatch" | "window_closed",
): string {
	switch (reason) {
		case "cooldown":
			return "You have applied too recently. Please wait before applying again.";
		case "duplicate":
			return "You have already applied this month";
		case "identity_mismatch":
			return "Your details need to be verified";
		case "window_closed":
			return "Applications are closed this month";
	}
}
