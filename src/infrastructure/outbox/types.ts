export type OutboxChannel = "sms" | "email";

export type OutboxStatus = "pending" | "sending" | "sent" | "failed";

export interface OutboxMessage {
	id: number;
	eventStream: string;
	eventPosition: bigint;
	eventType: string;
	channel: OutboxChannel;
	recipient: string;
	body: string;
	subject?: string;
	status: OutboxStatus;
	createdAt: string;
	sentAt?: string;
	error?: string;
	messageId?: string;
}

export interface OutboxMessageInput {
	eventStream: string;
	eventPosition: bigint;
	eventType: string;
	channel: OutboxChannel;
	recipient: string;
	body: string;
	subject?: string;
	createdAt: string;
}

export interface ChannelSender {
	send(
		recipient: string,
		body: string,
		subject?: string,
	): Promise<{ success: boolean; messageId?: string; error?: string }>;
}
