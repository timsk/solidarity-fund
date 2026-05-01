import type { SQLiteConnectionPool } from "@event-driven-io/emmett-sqlite";
import { createOutboxStore } from "../../infrastructure/outbox/store.ts";
import { type OutboxRow, outboxPage } from "../pages/outbox.ts";
import { calcOffset, calcTotalPages, parsePage } from "./utils.ts";

const VALID_STATUSES = ["pending", "sending", "sent", "failed"];

export function createOutboxRoutes(
	pool: ReturnType<typeof SQLiteConnectionPool>,
) {
	const store = createOutboxStore(pool);

	return {
		async list(req: Request): Promise<Response> {
			try {
				const url = new URL(req.url);
				const statusFilter = url.searchParams.get("status");
				const isValidStatus =
					statusFilter && VALID_STATUSES.includes(statusFilter);

				const { rows, total, pages, page } = await pool.withConnection(
					async (conn) => {
						let countQuery = "SELECT COUNT(*) AS total FROM outbox_messages";
						let dataQuery = `SELECT id, event_stream, event_position, event_type, channel, recipient, subject, body, status, created_at, sent_at, error, message_id
               FROM outbox_messages`;

						const params: (string | number)[] = [];

						if (isValidStatus) {
							countQuery += " WHERE status = ?";
							dataQuery += " WHERE status = ?";
							params.push(statusFilter);
						}

						const countRows = await conn.query<{ total: number }>(
							countQuery,
							params,
						);
						const total = countRows[0]?.total ?? 0;
						const pages = calcTotalPages(total);
						const page = parsePage(url.searchParams.get("page"), pages);
						const offset = calcOffset(page);

						dataQuery += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
						params.push(PAGE_SIZE, offset);

						const rows = await conn.query<OutboxRow>(dataQuery, params);

						return { rows, total, pages, page };
					},
				);

				const html = outboxPage(
					rows,
					page,
					pages,
					total,
					isValidStatus ? statusFilter : null,
				);
				return new Response(html, {
					headers: { "Content-Type": "text/html; charset=utf-8" },
				});
			} catch (err) {
				console.error("outbox route error:", err);
				return new Response("Internal error", { status: 500 });
			}
		},

		async deleteMessages(req: Request): Promise<Response> {
			const url = new URL(req.url);
			try {
				const formData = await req.formData();
				const rawIds = formData.getAll("ids");
				const ids = rawIds
					.map(Number)
					.filter((n) => Number.isInteger(n) && n > 0);
				const statusFilter = formData.get("status") as string | null;
				const page = formData.get("page") as string | null;

				if (ids.length === 0) {
					const redirect = buildRedirect(url, page, statusFilter);
					return new Response(null, {
						status: 303,
						headers: { Location: redirect },
					});
				}

				await pool.withConnection((conn) => store.deleteByIds(conn, ids));

				const redirect = buildRedirect(url, page, statusFilter);
				return new Response(null, {
					status: 303,
					headers: { Location: redirect },
				});
			} catch (err) {
				console.error("outbox delete route error:", err);
				return new Response("Internal error", { status: 500 });
			}
		},
	};
}

function buildRedirect(
	_url: URL,
	page: string | null,
	statusFilter: string | null,
): string {
	const params = new URLSearchParams();
	if (page) params.set("page", page);
	if (statusFilter && VALID_STATUSES.includes(statusFilter)) {
		params.set("status", statusFilter);
	}
	const qs = params.toString();
	return qs ? `/outbox?${qs}` : "/outbox";
}
