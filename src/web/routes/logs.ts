import type { SQLiteConnectionPool } from "@event-driven-io/emmett-sqlite";
import { type LogRow, logsPage } from "../pages/logs.ts";
import { calcOffset, calcTotalPages, parsePage } from "./utils.ts";

function collectVolunteerIds(rows: LogRow[]): Set<string> {
	const ids = new Set<string>();
	const volunteerFields = [
		"volunteerId",
		"verifiedBy",
		"rejectedBy",
		"paidBy",
		"releasedBy",
	];
	for (const row of rows) {
		try {
			const data = JSON.parse(row.message_data) as Record<string, unknown>;
			for (const field of volunteerFields) {
				const v = data[field];
				if (typeof v === "string" && v.length > 0) {
					ids.add(v);
				}
			}
		} catch {
			// skip unparseable messages
		}
	}
	return ids;
}

async function lookupVolunteerNames(
	pool: ReturnType<typeof SQLiteConnectionPool>,
	ids: Set<string>,
): Promise<Map<string, string>> {
	const map = new Map<string, string>();
	if (ids.size === 0) return map;

	const idList = [...ids];
	const placeholders = idList.map(() => "?");
	const rows = await pool.withConnection(async (conn) =>
		conn.query<{ id: string; name: string }>(
			`SELECT id, name FROM volunteers WHERE id IN (${placeholders.join(",")})`,
			idList,
		),
	);
	for (const row of rows) {
		map.set(row.id, row.name);
	}
	return map;
}

export function createLogsRoutes(
	pool: ReturnType<typeof SQLiteConnectionPool>,
) {
	return {
		async list(req: Request): Promise<Response> {
			try {
				const url = new URL(req.url);

				const { rows, total, pages, page } = await pool.withConnection(
					async (conn) => {
						const countRows = await conn.query<{ total: number }>(
							`SELECT COUNT(*) AS total FROM emt_messages WHERE message_kind = 'E'`,
							[],
						);
						const total = countRows[0]?.total ?? 0;
						const pages = calcTotalPages(total);
						const page = parsePage(url.searchParams.get("page"), pages);
						const offset = calcOffset(page);

						const rows = await conn.query<LogRow>(
							`SELECT global_position, created, message_type, message_data
         FROM emt_messages
         WHERE message_kind = 'E'
         ORDER BY global_position DESC
         LIMIT ? OFFSET ?`,
							[25, offset],
						);

						return { rows, total, pages, page };
					},
				);

				const volunteerIds = collectVolunteerIds(rows);
				const volunteerNames = await lookupVolunteerNames(pool, volunteerIds);

				const html = logsPage(rows, page, pages, total, volunteerNames);
				return new Response(html, {
					headers: { "Content-Type": "text/html; charset=utf-8" },
				});
			} catch (err) {
				console.error("logs route error:", err);
				return new Response("Internal error", { status: 500 });
			}
		},
	};
}
