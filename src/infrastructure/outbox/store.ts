import type { sqlite3 } from "bun:sqlite";
import type {
	SQLiteConnection,
	SQLiteConnectionPool,
} from "@event-driven-io/emmett-sqlite";
import { initOutboxSchema } from "./schema.ts";
import type {
	OutboxChannel,
	OutboxMessage,
	OutboxMessageInput,
	OutboxStatus,
} from "./types.ts";

type DbRow = {
	id: number;
	event_stream: string;
	event_position: number;
	event_type: string;
	channel: OutboxChannel;
	recipient: string;
	subject: string | null;
	body: string;
	status: OutboxStatus;
	created_at: string;
	sent_at: string | null;
	message_id: string | null;
	error: string | null;
};

function rowToOutboxMessage(row: DbRow): OutboxMessage {
	return {
		id: row.id,
		eventStream: row.event_stream,
		eventPosition: BigInt(row.event_position),
		eventType: row.event_type,
		channel: row.channel,
		recipient: row.recipient,
		subject: row.subject ?? undefined,
		body: row.body,
		status: row.status,
		createdAt: row.created_at,
		sentAt: row.sent_at ?? undefined,
		messageId: row.message_id ?? undefined,
		error: row.error ?? undefined,
	};
}

export function createOutboxStore(pool: SQLiteConnectionPool) {
	return {
		async init(): Promise<void> {
			await pool.withConnection(async (conn) => {
				await initOutboxSchema(conn);
			});
		},

		async recordMessage(
			conn: SQLiteConnection,
			msg: OutboxMessageInput,
		): Promise<boolean> {
			const result = await conn.command(
				`INSERT OR IGNORE INTO outbox_messages (event_stream, event_position, event_type, channel, recipient, subject, body, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
				[
					msg.eventStream,
					Number(msg.eventPosition),
					msg.eventType,
					msg.channel,
					msg.recipient,
					msg.subject ?? null,
					msg.body,
					msg.createdAt,
				],
			);
			return (result as sqlite3.RunResult).changes > 0;
		},

		async getPendingMessages(
			conn: SQLiteConnection,
			limit: number,
		): Promise<OutboxMessage[]> {
			const rows = await conn.query<DbRow>(
				`SELECT * FROM outbox_messages WHERE status = 'pending' ORDER BY created_at ASC LIMIT ?`,
				[limit],
			);
			return rows.map(rowToOutboxMessage);
		},

		async markSending(conn: SQLiteConnection, id: number): Promise<boolean> {
			const result = await conn.command(
				`UPDATE outbox_messages SET status = 'sending' WHERE id = ? AND status = 'pending'`,
				[id],
			);
			return (result as sqlite3.RunResult).changes > 0;
		},

		async markSent(
			conn: SQLiteConnection,
			id: number,
			messageId?: string,
		): Promise<void> {
			await conn.command(
				`UPDATE outbox_messages SET status = 'sent', sent_at = datetime('now'), message_id = ? WHERE id = ?`,
				[messageId ?? null, id],
			);
		},

		async markFailed(
			conn: SQLiteConnection,
			id: number,
			error: string,
		): Promise<void> {
			await conn.command(
				`UPDATE outbox_messages SET status = 'failed', error = ? WHERE id = ?`,
				[error, id],
			);
		},

		async deleteById(conn: SQLiteConnection, id: number): Promise<boolean> {
			const result = await conn.command(
				`DELETE FROM outbox_messages WHERE id = ?`,
				[id],
			);
			return (result as sqlite3.RunResult).changes > 0;
		},

		async deleteByIds(conn: SQLiteConnection, ids: number[]): Promise<number> {
			if (ids.length === 0) return 0;
			const placeholders = ids.map(() => "?");
			const result = await conn.command(
				`DELETE FROM outbox_messages WHERE id IN (${placeholders.join(",")})`,
				ids,
			);
			return (result as sqlite3.RunResult).changes;
		},

		withConnection<T>(fn: (conn: SQLiteConnection) => Promise<T>): Promise<T> {
			return pool.withConnection(fn);
		},
	};
}
