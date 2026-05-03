import { sqliteProjection } from "@event-driven-io/emmett-sqlite";
import type { LotteryEvent } from "../../domain/lottery/types.ts";

export const lotteryWindowProjection = sqliteProjection<LotteryEvent>({
	canHandle: [
		"ApplicationWindowOpened",
		"ApplicationWindowClosed",
		"LotteryCancelled",
		"LotteryDrawn",
	],

	init: async ({ context: { connection } }) => {
		await connection.command(`
			CREATE TABLE IF NOT EXISTS lottery_windows (
				lottery_name TEXT PRIMARY KEY,
				status TEXT NOT NULL,
				expected_closing_at TEXT
			)
		`);
		// Migration: add expected_closing_at column to existing databases
		try {
			await connection.command(
				"ALTER TABLE lottery_windows ADD COLUMN expected_closing_at TEXT",
			);
		} catch {
			// Column already exists
		}
	},

	handle: async (events, { connection }) => {
		for (const { type, data } of events) {
			switch (type) {
				case "ApplicationWindowOpened":
					await connection.command(
						`INSERT OR REPLACE INTO lottery_windows (lottery_name, status, expected_closing_at) VALUES (?, 'open', ?)`,
						[data.lotteryName, data.expectedClosingAt],
					);
					break;
				case "ApplicationWindowClosed":
					await connection.command(
						`UPDATE lottery_windows SET status = 'closed' WHERE lottery_name = ?`,
						[data.lotteryName],
					);
					break;
				case "LotteryCancelled":
					await connection.command(
						`UPDATE lottery_windows SET status = 'cancelled' WHERE lottery_name = ?`,
						[data.lotteryName],
					);
					break;
				case "LotteryDrawn":
					await connection.command(
						`UPDATE lottery_windows SET status = 'drawn' WHERE lottery_name = ?`,
						[data.lotteryName],
					);
					break;
			}
		}
	},
});
