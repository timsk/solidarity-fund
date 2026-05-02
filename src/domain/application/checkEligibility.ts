import type { SQLiteConnectionPool } from "@event-driven-io/emmett-sqlite";
import { normalizeName } from "./normalizeName.ts";
import type { EligibilityResult } from "./types.ts";

const COOLDOWN_MONTHS = 3;

function monthsAgo(lotteryName: string, n: number): string {
	const [year, month] = lotteryName.split("-").map(Number) as [number, number];
	const date = new Date(year, month - 1 - n, 1);
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, "0");
	return `${y}-${m}`;
}

export async function checkEligibility(
	applicantId: string,
	name: string,
	email: string | undefined,
	lotteryName: string,
	pool: ReturnType<typeof SQLiteConnectionPool>,
	options?: {
		skipWindowCheck?: boolean;
		excludeApplicationId?: string;
	},
): Promise<EligibilityResult> {
	return pool.withConnection(async (conn) => {
		if (!options?.skipWindowCheck) {
			// Check if lottery_windows table exists
			const windowTables = await conn.query<{ name: string }>(
				"SELECT name FROM sqlite_master WHERE type='table' AND name='lottery_windows'",
			);
			if (windowTables.length === 0) {
				return { status: "window_closed" } as const;
			}

			// Check window status
			const windowRows = await conn.query<{ status: string }>(
				"SELECT status FROM lottery_windows WHERE lottery_name = ? LIMIT 1",
				[lotteryName],
			);
			if (windowRows.length === 0 || windowRows[0]?.status !== "open") {
				return { status: "window_closed" } as const;
			}
		}

		const tables = await conn.query<{ name: string }>(
			"SELECT name FROM sqlite_master WHERE type='table' AND name='applications'",
		);
		if (tables.length === 0) {
			return { status: "eligible" } as const;
		}

		const excludeId = options?.excludeApplicationId;

		// Check for duplicate: any application this month that isn't rejected or flagged
		const duplicateQuery = excludeId
			? `SELECT id, applied_at, ref FROM applications
			   WHERE applicant_id = ?
			     AND lottery_name = ?
			     AND status NOT IN ('rejected', 'flagged')
			     AND id != ?
			   LIMIT 1`
			: `SELECT id, applied_at, ref FROM applications
			   WHERE applicant_id = ?
			     AND lottery_name = ?
			     AND status NOT IN ('rejected', 'flagged')
			   LIMIT 1`;

		const dupes = await conn.query<{
			id: string;
			applied_at: string;
			ref: string;
		}>(
			duplicateQuery,
			excludeId
				? [applicantId, lotteryName, excludeId]
				: [applicantId, lotteryName],
		);
		if (dupes.length > 0 && dupes[0]) {
			return {
				status: "duplicate",
				appliedAt: dupes[0].applied_at,
				ref: dupes[0].ref,
			} as const;
		}

		// Check for duplicate by (name + email) if email is provided
		if (email) {
			const emailDupes = await conn.query<{
				id: string;
				applied_at: string;
				ref: string;
			}>(
				`SELECT a.id, a.applied_at, a.ref FROM applications a
				 WHERE LOWER(a.name) = ?
				   AND LOWER(a.email) = ?
				   AND a.lottery_name = ?
				   AND a.status NOT IN ('rejected', 'flagged')
				 LIMIT 1`,
				[normalizeName(name), email.toLowerCase(), lotteryName],
			);
			if (emailDupes.length > 0 && emailDupes[0]) {
				return {
					status: "duplicate",
					appliedAt: emailDupes[0].applied_at,
					ref: emailDupes[0].ref,
				} as const;
			}
		}

		// Check cooldown: selected in last 3 months
		const rows = await conn.query<{ lottery_name: string }>(
			`SELECT lottery_name FROM applications
			 WHERE applicant_id = ?
			   AND status = 'selected'
			   AND lottery_name >= ?
			 ORDER BY lottery_name DESC
			 LIMIT 1`,
			[applicantId, monthsAgo(lotteryName, COOLDOWN_MONTHS)],
		);

		if (rows.length === 0 || !rows[0]) {
			return { status: "eligible" } as const;
		}

		return {
			status: "cooldown",
			lastGrantMonth: rows[0].lottery_name,
		} as const;
	});
}
