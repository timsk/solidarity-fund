import type { EmailClient } from "../email/client.ts";
import type { SmsClient } from "../sms/client.ts";
import type { ChannelSender } from "./types.ts";

export function buildChannelSenders(
	smsClient: SmsClient,
	emailClient?: EmailClient,
): Map<string, ChannelSender> {
	const senders = new Map<string, ChannelSender>();
	senders.set("sms", {
		send: (recipient: string, body: string, _subject?: string) =>
			smsClient.send({ to: recipient, body }),
	});
	if (emailClient) {
		senders.set("email", {
			send: (recipient: string, body: string, subject?: string) =>
				emailClient.send({ to: recipient, subject: subject ?? "", html: body }),
		});
	}
	return senders;
}
