import type { SQLiteConnectionPool } from "@event-driven-io/emmett-sqlite";
import type {
	ApplicationFilters,
	ApplicationRepository,
	ApplicationRow,
} from "../../domain/application/repository.ts";

type DbRow = {
	ref: string;
	id: string;
	applicant_id: string;
	lottery_name: string;
	status: string;
	rank: number | null;
	payment_preference: string;
	name: string | null;
	phone: string | null;
	reject_reason: string | null;
	applied_at: string | null;
	accepted_at: string | null;
	selected_at: string | null;
	rejected_at: string | null;
	email: string | null;
	meeting_place: string | null;
	sort_code: string | null;
	account_number: string | null;
	poa_ref: string | null;
	reviewed_by_volunteer_id: string | null;
};

function isNoSuchTable(err: unknown): boolean {
	return err instanceof Error && err.message.includes("no such table");
}

function rowToApplication(row: DbRow): ApplicationRow {
	return {
		ref: row.ref,
		id: row.id,
		applicantId: row.applicant_id,
		lotteryName: row.lottery_name,
		status: row.status,
		rank: row.rank,
		paymentPreference: row.payment_preference,
		name: row.name,
		phone: row.phone,
		rejectReason: row.reject_reason,
		appliedAt: row.applied_at,
		acceptedAt: row.accepted_at,
		selectedAt: row.selected_at,
		rejectedAt: row.rejected_at,
		email: row.email,
		meetingPlace: row.meeting_place,
		sortCode: row.sort_code,
		accountNumber: row.account_number,
		poaRef: row.poa_ref,
		reviewedByVolunteerId: row.reviewed_by_volunteer_id,
	};
}

export function SQLiteApplicationRepository(
	pool: ReturnType<typeof SQLiteConnectionPool>,
): ApplicationRepository {
	return {
		async getById(id: string): Promise<ApplicationRow | null> {
			try {
				return await pool.withConnection(async (conn) => {
					const rows = await conn.query<DbRow>(
						"SELECT * FROM applications WHERE id = ?",
						[id],
					);
					return rows.length > 0 ? rowToApplication(rows[0]!) : null;
				});
			} catch (err) {
				if (isNoSuchTable(err)) return null;
				throw err;
			}
		},

		async getByRef(ref: string): Promise<ApplicationRow | null> {
			try {
				return await pool.withConnection(async (conn) => {
					const rows = await conn.query<DbRow>(
						"SELECT * FROM applications WHERE ref = ?",
						[ref],
					);
					return rows.length > 0 ? rowToApplication(rows[0]!) : null;
				});
			} catch (err) {
				if (isNoSuchTable(err)) return null;
				throw err;
			}
		},

		async listByLottery(
			lotteryName: string,
			filters?: ApplicationFilters,
		): Promise<ApplicationRow[]> {
			try {
				return await pool.withConnection(async (conn) => {
					const conditions = ["lottery_name = ?"];
					const params: unknown[] = [lotteryName];

					if (filters?.status) {
						conditions.push("status = ?");
						params.push(filters.status);
					}
					if (filters?.paymentPreference) {
						conditions.push("payment_preference = ?");
						params.push(filters.paymentPreference);
					}

					const sql = `SELECT * FROM applications WHERE ${conditions.join(" AND ")} ORDER BY applied_at DESC`;
					const rows = await conn.query<DbRow>(sql, params);
					return rows.map(rowToApplication);
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
						"SELECT DISTINCT lottery_name FROM applications ORDER BY lottery_name DESC",
					);
					return rows.map((r) => r.lottery_name);
				});
			} catch (err) {
				if (isNoSuchTable(err)) return [];
				throw err;
			}
		},
	};
}
