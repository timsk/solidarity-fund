import type {
	SQLiteConnectionPool,
	SQLiteEventStore,
} from "@event-driven-io/emmett-sqlite";
import { closeApplicationWindow } from "../../domain/lottery/commandHandlers.ts";

export const PAGE_SIZE = 25;

export function parsePage(param: string | null, totalPages: number): number {
	const safeTotalPages = Math.max(1, totalPages);
	if (!param) return 1;
	const n = parseInt(param, 10);
	if (Number.isNaN(n)) return 1;
	return Math.min(Math.max(1, n), safeTotalPages);
}

export function calcOffset(page: number): number {
	return (page - 1) * PAGE_SIZE;
}

export function calcTotalPages(total: number): number {
	return Math.max(1, Math.ceil(total / PAGE_SIZE));
}

export function defaultLotteryName(): string {
	const now = new Date();
	const y = now.getFullYear();
	const m = String(now.getMonth() + 1).padStart(2, "0");
	return `${y}-${m}`;
}

export async function getCurrentLotteryName(
	pool: ReturnType<typeof SQLiteConnectionPool>,
): Promise<string> {
	try {
		return await pool.withConnection(async (conn) => {
			const tables = await conn.query<{ name: string }>(
				"SELECT name FROM sqlite_master WHERE type='table' AND name='lottery_windows'",
			);
			if (tables.length === 0) return defaultLotteryName();

			const rows = await conn.query<{ lottery_name: string }>(
				"SELECT lottery_name FROM lottery_windows ORDER BY CASE WHEN status = 'open' THEN 0 ELSE 1 END, lottery_name DESC LIMIT 1",
			);
			return rows[0]?.lottery_name ?? defaultLotteryName();
		});
	} catch {
		return defaultLotteryName();
	}
}

export async function getLotteryClosingTimestamp(
	pool: ReturnType<typeof SQLiteConnectionPool>,
): Promise<string | null> {
	try {
		return await pool.withConnection(async (conn) => {
			const rows = await conn.query<{ expected_closing_at: string | null }>(
				"SELECT expected_closing_at FROM lottery_windows WHERE status = 'open' ORDER BY lottery_name DESC LIMIT 1",
			);
			return rows[0]?.expected_closing_at ?? null;
		});
	} catch {
		return null;
	}
}

export async function getOpenLottery(
	pool: ReturnType<typeof SQLiteConnectionPool>,
): Promise<{ lottery_name: string; expected_closing_at: string } | null> {
	try {
		return await pool.withConnection(async (conn) => {
			const rows = await conn.query<{
				lottery_name: string;
				expected_closing_at: string;
			}>(
				"SELECT lottery_name, expected_closing_at FROM lottery_windows WHERE status = 'open' ORDER BY lottery_name DESC LIMIT 1",
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
			await closeFn(open.lottery_name, eventStore);
			return true;
		}

		return false;
	} catch {
		return false;
	}
}
