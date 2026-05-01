import { getSmsConfig, type SmsConfig } from "../../config.ts";
import { normalizePhone } from "../../domain/application/normalizePhone.ts";

export interface SmsClient {
	send(params: {
		to: string;
		body: string;
		from?: string;
	}): Promise<{ success: boolean; messageId?: string; error?: string }>;
}

// fallow-ignore-next-line unused-exports
export function toE164(phone: string): string {
	const digits = normalizePhone(phone);
	if (digits.startsWith("+")) return digits;
	if (digits.startsWith("0")) return `+44${digits.slice(1)}`;
	return `+${digits}`;
}

const CLICKSEND_API_URL = "https://rest.clicksend.com/v3/sms/send";
const REQUEST_TIMEOUT_MS = 10_000;

// fallow-ignore-next-line unused-exports
export class ClickSendSmsClient implements SmsClient {
	constructor(
		private username: string,
		private apiKey: string,
		private fromName?: string,
		private apiUrl?: string,
	) {}

	async send({ to, body }: { to: string; body: string }): Promise<{
		success: boolean;
		messageId?: string;
		error?: string;
	}> {
		const normalizedTo = toE164(to);

		const payload = {
			messages: [
				{
					to: normalizedTo,
					body,
					from: this.fromName ?? "CSF",
				},
			],
		};

		const auth = `${this.username}:${this.apiKey}`;
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

		const url = this.apiUrl ?? CLICKSEND_API_URL;

		try {
			const response = await fetch(url, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Basic ${btoa(auth)}`,
				},
				body: JSON.stringify(payload),
				signal: controller.signal,
			});
			clearTimeout(timeout);

			if (!response.ok) {
				return {
					success: false,
					error: `ClickSend API responded ${response.status} ${response.statusText}`,
				};
			}

			const result = (await response.json()) as {
				data?: { messages?: { message_id?: string; status?: string }[] };
				http_code?: number;
				response_msg?: string;
			};

			const messageId = result.data?.messages?.[0]?.message_id;
			return { success: true, messageId };
		} catch (err) {
			clearTimeout(timeout);
			return {
				success: false,
				error: err instanceof Error ? err.message : String(err),
			};
		}
	}
}

// fallow-ignore-next-line unused-exports
export class NullSmsClient implements SmsClient {
	async send() {
		return { success: true };
	}
}

export function createSmsClient(config?: SmsConfig): SmsClient {
	const cfg = config ?? getSmsConfig();
	if (cfg.enabled) {
		return new ClickSendSmsClient(cfg.username, cfg.apiKey, cfg.fromName);
	}
	return new NullSmsClient();
}
