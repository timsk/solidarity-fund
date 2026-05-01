import type {
	SQLiteConnectionPool,
	SQLiteEventStore,
} from "@event-driven-io/emmett-sqlite";
import { closeApplicationWindow } from "../../domain/lottery/commandHandlers.ts";

export function currentMonthCycle(): string {
	const now = new Date();
	const y = now.getFullYear();
	const m = String(now.getMonth() + 1).padStart(2, "0");
	return `${y}-${m}`;
}

export async function getCurrentLotteryMonthCycle(
	pool: ReturnType<typeof SQLiteConnectionPool>,
): Promise<string> {
	try {
		return await pool.withConnection(async (conn) => {
			const tables = await conn.query<{ name: string }>(
				"SELECT name FROM sqlite_master WHERE type='table' AND name='lottery_windows'",
			);
			if (tables.length === 0) return currentMonthCycle();

			const rows = await conn.query<{ month_cycle: string }>(
				"SELECT month_cycle FROM lottery_windows ORDER BY month_cycle DESC LIMIT 1",
			);
			return rows[0]?.month_cycle ?? currentMonthCycle();
		});
	} catch {
		return currentMonthCycle();
	}
}

export async function getLotteryClosingTimestamp(
	pool: ReturnType<typeof SQLiteConnectionPool>,
): Promise<string | null> {
	try {
		return await pool.withConnection(async (conn) => {
			const rows = await conn.query<{ expected_closing_at: string | null }>(
				"SELECT expected_closing_at FROM lottery_windows WHERE status = 'open' ORDER BY month_cycle DESC LIMIT 1",
			);
			return rows[0]?.expected_closing_at ?? null;
		});
	} catch {
		return null;
	}
}

export async function getOpenLottery(
	pool: ReturnType<typeof SQLiteConnectionPool>,
): Promise<{ month_cycle: string; expected_closing_at: string } | null> {
	try {
		return await pool.withConnection(async (conn) => {
			const rows = await conn.query<{
				month_cycle: string;
				expected_closing_at: string;
			}>(
				"SELECT month_cycle, expected_closing_at FROM lottery_windows WHERE status = 'open' ORDER BY month_cycle DESC LIMIT 1",
			);
			return rows[0] ?? null;
		});
	} catch {
		return null;
	}
}

export async function autoCloseExpiredLottery(
	pool: ReturnType<typeof SQLiteConnectionPool>,
	eventStore: SQLiteEventStore,
	closeFn: typeof closeApplicationWindow = closeApplicationWindow,
): Promise<boolean> {
	try {
		const open = await getOpenLottery(pool);
		if (!open) return false;

		if (open.expected_closing_at <= new Date().toISOString()) {
			await closeFn(open.month_cycle, eventStore);
			return true;
		}

		return false;
	} catch {
		return false;
	}
}
