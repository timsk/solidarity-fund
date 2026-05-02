import type { SQLiteConnectionPool } from "@event-driven-io/emmett-sqlite";
import type { ApplicantRepository } from "../../domain/applicant/repository.ts";
import type { Applicant } from "../../domain/applicant/types.ts";

type ApplicantRow = {
	id: string;
	phone: string;
	name: string;
	email: string | null;
	notes: string | null;
	created_at: string;
	updated_at: string;
};

function rowToApplicant(row: ApplicantRow): Applicant {
	return {
		id: row.id,
		phone: row.phone,
		name: row.name,
		email: row.email ?? undefined,
		notes: row.notes ?? undefined,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

export async function SQLiteApplicantRepository(
	pool: ReturnType<typeof SQLiteConnectionPool>,
): Promise<ApplicantRepository> {
	await pool.withConnection(async (conn) => {
		await conn.command(`
			CREATE TABLE IF NOT EXISTS applicants (
				id TEXT PRIMARY KEY,
				phone TEXT NOT NULL,
				name TEXT NOT NULL,
				email TEXT,
				notes TEXT,
				created_at TEXT NOT NULL,
				updated_at TEXT NOT NULL
			)
		`);
		// Migration: add notes column to existing databases
		// (CREATE TABLE above already includes it for fresh installs)
		try {
			await conn.command("ALTER TABLE applicants ADD COLUMN notes TEXT");
		} catch (e) {
			if (!(e instanceof Error && e.message.includes("duplicate column")))
				throw e;
		}
	});

	return {
		async getById(id: string): Promise<Applicant | null> {
			return await pool.withConnection(async (conn) => {
				const rows = await conn.query<ApplicantRow>(
					"SELECT * FROM applicants WHERE id = ?",
					[id],
				);
				return rows.length > 0 ? rowToApplicant(rows[0]!) : null;
			});
		},

		async getByPhone(phone: string): Promise<Applicant[]> {
			return await pool.withConnection(async (conn) => {
				const rows = await conn.query<ApplicantRow>(
					"SELECT * FROM applicants WHERE phone = ?",
					[phone],
				);
				return rows.map(rowToApplicant);
			});
		},

		async getByPhoneAndName(
			phone: string,
			name: string,
		): Promise<Applicant | null> {
			return await pool.withConnection(async (conn) => {
				const rows = await conn.query<ApplicantRow>(
			"SELECT * FROM applicants WHERE phone = ? AND name = ? COLLATE NOCASE",
				[phone, name],
				);
				return rows.length > 0 ? rowToApplicant(rows[0]!) : null;
			});
		},

		async list(): Promise<Applicant[]> {
			return await pool.withConnection(async (conn) => {
				const rows = await conn.query<ApplicantRow>(
					"SELECT * FROM applicants ORDER BY created_at DESC",
				);
				return rows.map(rowToApplicant);
			});
		},

		async updateNotes(id: string, notes: string): Promise<void> {
			await pool.withConnection(async (conn) => {
				await conn.command("UPDATE applicants SET notes = ? WHERE id = ?", [
					notes || null,
					id,
				]);
			});
		},
	};
}
