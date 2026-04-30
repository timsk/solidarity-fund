import type {
	ApplicationEvent,
	ApplicationEventType,
} from "../../domain/application/types.ts";
import type { GrantEvent, GrantEventType } from "../../domain/grant/types.ts";
import { getTemplateVariables as getSmsTemplateVariables } from "../sms/templates.ts";

export type EmailTemplateVariables = {
	fundName: string;
	shortId: string;
	reason?: string;
};

export type EmailTemplate = (variables: EmailTemplateVariables) => {
	subject: string;
	html: string;
};

const defaultTemplates: Record<
	ApplicationEventType | GrantEventType,
	EmailTemplate | undefined
> = {
	ApplicationSubmitted: ({ fundName, shortId }) => ({
		subject: "Application received",
		html: `<p>Your application for <strong>${fundName}</strong> (ID: ${shortId}) has been received.</p><p>We'll review it and be in touch.</p>`,
	}),
	ApplicationAccepted: ({ fundName, shortId }) => ({
		subject: "Application accepted",
		html: `<p>Your application for <strong>${fundName}</strong> (ID: ${shortId}) has been accepted.</p><p>We'll be in touch with next steps.</p>`,
	}),
	ApplicationRejected: ({ fundName, shortId, reason }) => ({
		subject: "Application update",
		html: `<p>Your application for <strong>${fundName}</strong> (ID: ${shortId}) could not be approved.</p><p>Reason: <em>${reason ?? "Not specified"}</em>.</p>`,
	}),
	ApplicationConfirmed: undefined,
	ApplicationFlaggedForReview: undefined,
	ApplicationSelected: ({ fundName, shortId }) => ({
		subject: "Good news — selected in lottery",
		html: `<p>Good news — your application for <strong>${fundName}</strong> (ID: ${shortId}) has been selected in this month's lottery.</p><p>A volunteer will contact you about receiving your grant.</p>`,
	}),
	ApplicationNotSelected: ({ fundName, shortId }) => ({
		subject: "This month's lottery results",
		html: `<p>Thank you for applying to <strong>${fundName}</strong> (ID: ${shortId}).</p><p>Unfortunately you were not selected in this month's lottery. Please apply again next month.</p>`,
	}),
	GrantCreated: undefined,
	VolunteerAssigned: undefined,
	BankDetailsUpdated: undefined,
	ProofOfAddressApproved: undefined,
	ProofOfAddressRejected: undefined,
	CashAlternativeOffered: undefined,
	CashAlternativeAccepted: undefined,
	CashAlternativeDeclined: undefined,
	GrantPaid: ({ fundName, shortId }) => ({
		subject: "Grant payment confirmation",
		html: `<p>Your grant from <strong>${fundName}</strong> (ID: ${shortId}) has been paid.</p><p>Please let us know when you receive it.</p>`,
	}),
	SlotReleased: undefined,
	VolunteerReimbursed: undefined,
};

export function getEmailTemplate(eventType: string): EmailTemplate | undefined {
	return defaultTemplates[eventType as keyof typeof defaultTemplates];
}

export function getTemplateVariables(
	event: ApplicationEvent | GrantEvent,
): EmailTemplateVariables | null {
	const smsVars = getSmsTemplateVariables(event);
	if (!smsVars) return null;
	return {
		fundName: smsVars.fundName,
		shortId: smsVars.shortId,
		reason: smsVars.reason,
	};
}
