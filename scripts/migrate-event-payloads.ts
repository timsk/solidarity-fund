#!/usr/bin/env bun

import { Database } from "bun:sqlite";
import { resolve } from "node:path";

const MIGRATION_MARKER = "lotteryName_migrated_v1";

export function migrateEventPayloads(dbPath: string): void {
	const fullPath = resolve(dbPath);
	const db = new Database(fullPath);

	const tableExists = db
		.query(
			"SELECT name FROM sqlite_master WHERE type='table' AND name='emt_metadata'",
		)
		.get() as { name: string } | undefined;

	if (!tableExists) {
		db.exec(`
			CREATE TABLE IF NOT EXISTS emt_metadata (
				key TEXT PRIMARY KEY,
				value TEXT NOT NULL
			)
		`);
	}

	const marker = db
		.query("SELECT value FROM emt_metadata WHERE key = ?")
		.get(MIGRATION_MARKER) as { value: string } | undefined;

	if (marker) {
		console.log("✅ Already migrated. Skipping.");
		db.close();
		return;
	}

	const events = db
		.query(
			`SELECT global_position, message_type, message_data FROM emt_messages WHERE message_kind = 'E'`,
		)
		.all() as Array<{
		global_position: number;
		message_type: string;
		message_data: string;
	}>;

	let migrated = 0;
	let unchanged = 0;

	const updateStmt = db.prepare(
		"UPDATE emt_messages SET message_data = ? WHERE global_position = ?",
	);

	const tx = db.transaction((rows: typeof events) => {
		for (const row of rows) {
			let data: Record<string, unknown>;
			try {
				data = JSON.parse(row.message_data) as Record<string, unknown>;
			} catch {
				unchanged++;
				continue;
			}

			let changed = false;

			if ("monthCycle" in data) {
				data.lotteryName = data.monthCycle;
				delete data.monthCycle;
				changed = true;
			}

			if ("lotteryMonthCycle" in data) {
				data.lotteryName = data.lotteryMonthCycle;
				delete data.lotteryMonthCycle;
				changed = true;
			}

			if (changed) {
				updateStmt.run(JSON.stringify(data), row.global_position);
				migrated++;
			} else {
				unchanged++;
			}
		}
	});

	tx(events);

	db.prepare("INSERT INTO emt_metadata (key, value) VALUES (?, ?)").run(
		MIGRATION_MARKER,
		new Date().toISOString(),
	);

	db.close();

	console.log(`Migrated ${migrated} of ${events.length} events`);
	if (unchanged > 0) {
		console.log(`Unchanged: ${unchanged} events`);
	}
}

const dbPath = process.argv[2] ?? "./csf.db";
migrateEventPayloads(dbPath);
