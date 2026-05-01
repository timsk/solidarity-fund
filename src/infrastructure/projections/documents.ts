import type { SQLiteConnectionPool } from "@event-driven-io/emmett-sqlite";

// fallow-ignore-next-line unused-types
export type Document = {
	id: string;
	entityId: string;
	type: string;
	data: Buffer;
	mimeType: string;
	uploadedAt: string;
};

type DbRow = {
	id: string;
	entity_id: string;
	type: string;
	data: Buffer;
	mime_type: string;
	uploaded_at: string;
};

export function DocumentStore(pool: ReturnType<typeof SQLiteConnectionPool>) {
	return {
		async init(): Promise<void> {
			await pool.withConnection(async (conn) => {
				await conn.command(`
					CREATE TABLE IF NOT EXISTS documents (
						id TEXT PRIMARY KEY,
						entity_id TEXT NOT NULL,
						type TEXT NOT NULL,
						data BLOB NOT NULL,
						mime_type TEXT NOT NULL,
						uploaded_at TEXT NOT NULL
					)
				`);
			});
		},

		async store(doc: {
			id: string;
			entityId: string;
			type: string;
			data: Buffer;
			mimeType: string;
		}): Promise<void> {
			const now = new Date().toISOString();
			await pool.withConnection(async (conn) => {
				await conn.command(
					`INSERT INTO documents (id, entity_id, type, data, mime_type, uploaded_at)
					 VALUES (?, ?, ?, ?, ?, ?)`,
					[doc.id, doc.entityId, doc.type, doc.data, doc.mimeType, now],
				);
			});
		},

		async getById(id: string): Promise<Document | null> {
			try {
				return await pool.withConnection(async (conn) => {
					const rows = await conn.query<DbRow>(
						"SELECT * FROM documents WHERE id = ?",
						[id],
					);
					const row = rows[0];
					if (!row) return null;
					return {
						id: row.id,
						entityId: row.entity_id,
						type: row.type,
						data: row.data,
						mimeType: row.mime_type,
						uploadedAt: row.uploaded_at,
					};
				});
			} catch {
				return null;
			}
		},

		async getByEntityId(entityId: string): Promise<Document[]> {
			try {
				return await pool.withConnection(async (conn) => {
					const rows = await conn.query<DbRow>(
						"SELECT * FROM documents WHERE entity_id = ? ORDER BY uploaded_at DESC",
						[entityId],
					);
					return rows.map((row) => ({
						id: row.id,
						entityId: row.entity_id,
						type: row.type,
						data: row.data,
						mimeType: row.mime_type,
						uploadedAt: row.uploaded_at,
					}));
				});
			} catch {
				return [];
			}
		},
	};
}
