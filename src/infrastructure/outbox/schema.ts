import type { SQLiteConnection } from "@event-driven-io/emmett-sqlite";

const OUTBOX_MESSAGES_TABLE_DDL = `
	CREATE TABLE IF NOT EXISTS outbox_messages (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		event_stream TEXT NOT NULL,
		event_position INTEGER NOT NULL,
		event_type TEXT NOT NULL,
		channel TEXT NOT NULL,
		recipient TEXT NOT NULL,
		subject TEXT,
		body TEXT NOT NULL,
		status TEXT NOT NULL DEFAULT 'pending',
		created_at TEXT NOT NULL,
		sent_at TEXT,
		error TEXT,
		message_id TEXT,
		UNIQUE(event_stream, event_position, channel)
	)
`;

export async function initOutboxSchema(conn: SQLiteConnection): Promise<void> {
	await conn.command(OUTBOX_MESSAGES_TABLE_DDL);

	// Migration: add subject column to existing databases
	// (CREATE TABLE above already includes it for fresh installs)
	try {
		await conn.command("ALTER TABLE outbox_messages ADD COLUMN subject TEXT");
	} catch (e) {
		if (!(e instanceof Error && e.message.includes("duplicate column")))
			throw e;
	}
}
