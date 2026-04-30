import { beforeEach, describe, expect, it } from "bun:test";
import { SQLiteConnectionPool } from "@event-driven-io/emmett-sqlite";
import { initOutboxSchema } from "../../src/infrastructure/outbox/schema.ts";
import { startOutboxSenderLoop } from "../../src/infrastructure/outbox/sender.ts";
import { createOutboxStore } from "../../src/infrastructure/outbox/store.ts";
import type {
	ChannelSender,
	OutboxMessageInput,
} from "../../src/infrastructure/outbox/types.ts";

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function insertPendingMessage(
	pool: ReturnType<typeof SQLiteConnectionPool>,
	store: ReturnType<typeof createOutboxStore>,
	overrides: Partial<OutboxMessageInput> = {},
) {
	return pool.withConnection(async (conn) => {
		const input: OutboxMessageInput = {
			eventStream: "application-test-1",
			eventPosition: 1n,
			eventType: "ApplicationSubmitted",
			channel: "sms",
			recipient: "+447777777777",
			body: "Your application has been received.",
			subject: undefined,
			createdAt: new Date().toISOString(),
			...overrides,
		};
		await store.recordMessage(conn, input);
	});
}

describe("Outbox Sender Loop", () => {
	let pool: ReturnType<typeof SQLiteConnectionPool>;
	let store: ReturnType<typeof createOutboxStore>;

	beforeEach(async () => {
		pool = SQLiteConnectionPool({ fileName: ":memory:" });
		store = createOutboxStore(pool);
		await store.init();
	});

	it("sends pending messages and marks them sent", async () => {
		await insertPendingMessage(pool, store);

		const mockSender: ChannelSender = {
			send: async () => ({ success: true, messageId: "ext-id-123" }),
		};
		const senders = new Map<string, ChannelSender>();
		senders.set("sms", mockSender);

		const { stop } = startOutboxSenderLoop({
			store,
			pool,
			senders,
			intervalMs: 100,
		});

		await sleep(200);
		stop();

		const message = await pool.withConnection(async (conn) => {
			const rows = await conn.query<{ status: string; message_id: string }>(
				"SELECT status, message_id FROM outbox_messages WHERE id = 1",
			);
			return rows[0];
		});

		expect(message.status).toBe("sent");
		expect(message.message_id).toBe("ext-id-123");
	});

	it("marks failed messages on send failure", async () => {
		await insertPendingMessage(pool, store);

		const mockSender: ChannelSender = {
			send: async () => ({ success: false, error: "rate limited" }),
		};
		const senders = new Map<string, ChannelSender>();
		senders.set("sms", mockSender);

		const { stop } = startOutboxSenderLoop({
			store,
			pool,
			senders,
			intervalMs: 100,
		});

		await sleep(200);
		stop();

		const message = await pool.withConnection(async (conn) => {
			const rows = await conn.query<{ status: string; error: string }>(
				"SELECT status, error FROM outbox_messages WHERE id = 1",
			);
			return rows[0];
		});

		expect(message.status).toBe("failed");
		expect(message.error).toBe("rate limited");
	});

	it("handles sender throw", async () => {
		await insertPendingMessage(pool, store);

		const mockSender: ChannelSender = {
			send: async () => {
				throw new Error("timeout");
			},
		};
		const senders = new Map<string, ChannelSender>();
		senders.set("sms", mockSender);

		const { stop } = startOutboxSenderLoop({
			store,
			pool,
			senders,
			intervalMs: 100,
		});

		await sleep(200);
		stop();

		const message = await pool.withConnection(async (conn) => {
			const rows = await conn.query<{ status: string; error: string }>(
				"SELECT status, error FROM outbox_messages WHERE id = 1",
			);
			return rows[0];
		});

		expect(message.status).toBe("failed");
		expect(message.error).toBe("timeout");
	});

	it("skips messages with unknown channel", async () => {
		await insertPendingMessage(pool, store, { channel: "email" });

		const mockSender: ChannelSender = {
			send: async () => ({ success: true, messageId: "ext-id-123" }),
		};
		const senders = new Map<string, ChannelSender>();
		senders.set("sms", mockSender);

		const { stop } = startOutboxSenderLoop({
			store,
			pool,
			senders,
			intervalMs: 100,
		});

		await sleep(200);
		stop();

		const message = await pool.withConnection(async (conn) => {
			const rows = await conn.query<{ status: string; error: string }>(
				"SELECT status, error FROM outbox_messages WHERE id = 1",
			);
			return rows[0];
		});

		expect(message.status).toBe("failed");
		expect(message.error).toContain("No sender for channel");
	});

	it("stops cleanly", async () => {
		const senders = new Map<string, ChannelSender>();
		senders.set("sms", {
			send: async () => ({ success: true }),
		});

		const { stop } = startOutboxSenderLoop({
			store,
			pool,
			senders,
			intervalMs: 100,
		});

		expect(() => stop()).not.toThrow();
	});

	it("dispatches email messages via email channel sender", async () => {
		let emailSendCall:
			| { recipient: string; body: string; subject?: string }
			| undefined;
		const fakeEmailSender: ChannelSender = {
			send: async (recipient, body, subject) => {
				emailSendCall = { recipient, body, subject };
				return { success: true, messageId: "email-msg-456" };
			},
		};

		const fakeSmsSender: ChannelSender = {
			send: async () => ({ success: true, messageId: "sms-id" }),
		};

		const senders = new Map<string, ChannelSender>();
		senders.set("sms", fakeSmsSender);
		senders.set("email", fakeEmailSender);

		await insertPendingMessage(pool, store, {
			channel: "email",
			recipient: "test@example.com",
			body: "Your application status update",
			subject: "Application Update",
		});

		const { stop } = startOutboxSenderLoop({
			store,
			pool,
			senders,
			intervalMs: 100,
		});

		await sleep(200);
		stop();

		expect(emailSendCall).toBeDefined();
		expect(emailSendCall!.recipient).toBe("test@example.com");
		expect(emailSendCall!.body).toBe("Your application status update");
		expect(emailSendCall!.subject).toBe("Application Update");

		const message = await pool.withConnection(async (conn) => {
			const rows = await conn.query<{ status: string; message_id: string }>(
				"SELECT status, message_id FROM outbox_messages WHERE id = 1",
			);
			return rows[0];
		});

		expect(message.status).toBe("sent");
		expect(message.message_id).toBe("email-msg-456");
	});
});
