import type { SQLiteConnectionPool } from "@event-driven-io/emmett-sqlite";
import type {
	GrantRepository,
	GrantRow,
} from "../../domain/grant/repository.ts";

type DbRow = {
	id: string;
	application_id: string;
	applicant_id: string;
	lottery_name: string;
	rank: number;
	status: string;
	payment_preference: string;
	sort_code: string | null;
	account_number: string | null;
	poa_ref: string | null;
	volunteer_id: string | null;
	volunteer_name: string | null;
	applicant_name: string | null;
	applicant_phone: string | null;
	poa_attempts: number;
	amount: number | null;
	payment_method: string | null;
	paid_by: string | null;
	paid_at: string | null;
	expense_reference: string | null;
	reimbursed_at: string | null;
	released_reason: string | null;
	released_at: string | null;
	notes: string | null;
	created_at: string;
	updated_at: string;
};

function isNoSuchTable(err: unknown): boolean {
	return err instanceof Error && err.message.includes("no such table");
}

function rowToGrant(row: DbRow): GrantRow {
	return {
		id: row.id,
		applicationId: row.application_id,
		applicantId: row.applicant_id,
		lotteryName: row.lottery_name,
		rank: row.rank,
		status: row.status,
		paymentPreference: row.payment_preference,
		sortCode: row.sort_code,
		accountNumber: row.account_number,
		proofOfAddressRef: row.poa_ref,
		volunteerId: row.volunteer_id,
		volunteerName: row.volunteer_name,
		applicantName: row.applicant_name,
		applicantPhone: row.applicant_phone,
		poaAttempts: row.poa_attempts,
		amount: row.amount,
		paymentMethod: row.payment_method,
		paidBy: row.paid_by,
		paidAt: row.paid_at,
		expenseReference: row.expense_reference,
		reimbursedAt: row.reimbursed_at,
		releasedReason: row.released_reason,
		releasedAt: row.released_at,
		notes: row.notes,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

const SELECT_GRANTS = `
	SELECT g.*,
		v.name AS volunteer_name,
		a.name AS applicant_name,
		a.phone AS applicant_phone
	FROM grants g
	LEFT JOIN volunteers v ON g.volunteer_id = v.id
	LEFT JOIN applicants a ON g.applicant_id = a.id
`;

export function SQLiteGrantRepository(
	pool: ReturnType<typeof SQLiteConnectionPool>,
): GrantRepository {
	return {
		async getById(id: string): Promise<GrantRow | null> {
			try {
				return await pool.withConnection(async (conn) => {
					const rows = await conn.query<DbRow>(
						`${SELECT_GRANTS} WHERE g.id = ?`,
						[id],
					);
					const first = rows[0];
					return first ? rowToGrant(first) : null;
				});
			} catch (err) {
				if (isNoSuchTable(err)) return null;
				throw err;
			}
		},

		async getByApplicationId(applicationId: string): Promise<GrantRow | null> {
			try {
				return await pool.withConnection(async (conn) => {
					const rows = await conn.query<DbRow>(
						`${SELECT_GRANTS} WHERE g.application_id = ? LIMIT 1`,
						[applicationId],
					);
					return rows.length > 0 ? rowToGrant(rows[0]!) : null;
				});
			} catch (err) {
				if (isNoSuchTable(err)) return null;
				throw err;
			}
		},

		async listByLottery(lotteryName: string): Promise<GrantRow[]> {
			try {
				return await pool.withConnection(async (conn) => {
					const rows = await conn.query<DbRow>(
						`${SELECT_GRANTS} WHERE g.lottery_name = ? ORDER BY g.rank ASC`,
						[lotteryName],
					);
					return rows.map(rowToGrant);
				});
			} catch (err) {
				if (isNoSuchTable(err)) return [];
				throw err;
			}
		},

		async listDistinctLotteries(): Promise<string[]> {
			try {
				return await pool.withConnection(async (conn) => {
					const rows = await conn.query<{ lottery_name: string }>(
						"SELECT DISTINCT lottery_name FROM grants ORDER BY lottery_name DESC",
					);
					return rows.map((r) => r.lottery_name);
				});
			} catch (err) {
				if (isNoSuchTable(err)) return [];
				throw err;
			}
		},

		async updateNotes(id: string, notes: string): Promise<void> {
			await pool.withConnection(async (conn) => {
				await conn.command("UPDATE grants SET notes = ? WHERE id = ?", [
					notes || null,
					id,
				]);
			});
		},
	};
}
