import nodemailer from "nodemailer";
import { type EmailConfig, getEmailConfig } from "../../config.ts";

export interface EmailClient {
	send(params: {
		to: string;
		subject: string;
		html: string;
		text?: string;
	}): Promise<{ success: boolean; messageId?: string; error?: string }>;
}

// fallow-ignore-next-line unused-exports
export class SmtpEmailClient implements EmailClient {
	private transporter: nodemailer.Transporter;

	constructor(
		private user: string,
		appPassword: string,
		private fromName?: string,
	) {
		this.transporter = nodemailer.createTransport({
			service: "gmail",
			auth: { user, pass: appPassword },
		});
	}

	async send({
		to,
		subject,
		html,
		text,
	}: {
		to: string;
		subject: string;
		html: string;
		text?: string;
	}): Promise<{ success: boolean; messageId?: string; error?: string }> {
		const info = await this.transporter.sendMail({
			from: this.fromName || this.user,
			to,
			subject,
			html,
			text,
		});

		const accepted = info.accepted ?? [];
		if (accepted.length > 0) {
			return { success: true, messageId: info.messageId };
		}
		return { success: false, error: "No recipients accepted the message" };
	}
}

// fallow-ignore-next-line unused-exports
export class NullEmailClient implements EmailClient {
	async send() {
		return { success: true };
	}
}

export function createEmailClient(config?: EmailConfig): EmailClient {
	const cfg = config ?? getEmailConfig();
	if (cfg.enabled) {
		return new SmtpEmailClient(cfg.user, cfg.appPassword, cfg.fromName);
	}
	return new NullEmailClient();
}
