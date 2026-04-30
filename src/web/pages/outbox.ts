import { layout } from "./layout.ts";

export type OutboxRow = {
	id: number;
	event_stream: string;
	event_position: number;
	event_type: string;
	channel: string;
	recipient: string;
	subject: string | null;
	body: string;
	status: string;
	created_at: string;
	sent_at: string | null;
	error: string | null;
	message_id: string | null;
};

const VALID_STATUSES = ["pending", "sending", "sent", "failed"];

export function outboxPage(
	rows: OutboxRow[],
	page: number,
	totalPages: number,
	totalCount: number,
	statusFilter: string | null,
): string {
	const statusVal =
		statusFilter && VALID_STATUSES.includes(statusFilter) ? statusFilter : "";
	const hasRows = rows.length > 0;

	return layout(
		"Outbox",
		`
<div class="max-w-6xl mx-auto px-4 py-8">
  <div class="flex items-center justify-between mb-6">
    <div>
      <h1 class="font-heading font-bold text-2xl">Outbox</h1>
      <p class="text-bark-muted text-sm mt-1">${totalCount} messages · Page ${page} of ${totalPages}</p>
    </div>
    <a href="/" class="btn btn-secondary text-sm">← Dashboard</a>
  </div>

  <div class="flex items-center gap-2 mb-4">
    <a href="/outbox" class="px-3 py-1.5 rounded text-sm font-medium ${statusFilter === null ? "bg-bark text-cream" : "bg-cream-100 text-bark-muted hover:bg-cream-200"}">All</a>
    <a href="/outbox?status=pending" class="px-3 py-1.5 rounded text-sm font-medium ${statusFilter === "pending" ? "bg-bark text-cream" : "bg-cream-100 text-bark-muted hover:bg-cream-200"}">Pending</a>
    <a href="/outbox?status=sending" class="px-3 py-1.5 rounded text-sm font-medium ${statusFilter === "sending" ? "bg-bark text-cream" : "bg-cream-100 text-bark-muted hover:bg-cream-200"}">Sending</a>
    <a href="/outbox?status=sent" class="px-3 py-1.5 rounded text-sm font-medium ${statusFilter === "sent" ? "bg-bark text-cream" : "bg-cream-100 text-bark-muted hover:bg-cream-200"}">Sent</a>
    <a href="/outbox?status=failed" class="px-3 py-1.5 rounded text-sm font-medium ${statusFilter === "failed" ? "bg-bark text-cream" : "bg-cream-100 text-bark-muted hover:bg-cream-200"}">Failed</a>
  </div>

  ${paginationControls(page, totalPages, statusFilter)}

  <form method="POST" action="/outbox/delete" id="bulk-delete-form" class="mt-4">
    <input type="hidden" name="page" value="${page}">
    <input type="hidden" name="status" value="${statusVal}">

    ${hasRows ? bulkDeleteButton() : ""}

    <div class="card overflow-hidden">
      <table class="w-full border-collapse text-sm">
        <thead>
          <tr class="bg-cream-100">
            <th class="px-2 py-2 w-8">
              <input type="checkbox" id="select-all" onclick="document.querySelectorAll('#bulk-delete-form input[name=ids]').forEach(cb=>cb.checked=this.checked)" title="Select all">
            </th>
            <th class="px-3 py-2 text-left font-heading text-xs uppercase tracking-wide text-bark-muted border-b border-cream-200 w-32">Time</th>
            <th class="px-3 py-2 text-left font-heading text-xs uppercase tracking-wide text-bark-muted border-b border-cream-200 w-24">Channel</th>
            <th class="px-3 py-2 text-left font-heading text-xs uppercase tracking-wide text-bark-muted border-b border-cream-200 w-48">Subject</th>
            <th class="px-3 py-2 text-left font-heading text-xs uppercase tracking-wide text-bark-muted border-b border-cream-200 w-48">Recipient</th>
            <th class="px-3 py-2 text-left font-heading text-xs uppercase tracking-wide text-bark-muted border-b border-cream-200">Body</th>
            <th class="px-3 py-2 text-left font-heading text-xs uppercase tracking-wide text-bark-muted border-b border-cream-200 w-28">Status</th>
            <th class="px-3 py-2 text-left font-heading text-xs uppercase tracking-wide text-bark-muted border-b border-cream-200">Error</th>
            <th class="px-2 py-2 w-8 border-b border-cream-200"></th>
          </tr>
        </thead>
        <tbody>
          ${hasRows ? rows.map((r) => renderRow(r, page, statusVal)).join("") : emptyRow()}
        </tbody>
      </table>
    </div>

    ${hasRows ? bulkDeleteButton() : ""}
  </form>

  ${totalPages > 1 ? `<div class="mt-4">${paginationControls(page, totalPages, statusFilter)}</div>` : ""}
</div>
`,
	);
}

function emptyRow(): string {
	return `<tr><td colspan="9" class="px-3 py-8 text-center text-bark-muted text-sm">No messages yet.</td></tr>`;
}

function renderRow(row: OutboxRow, page: number, statusVal: string): string {
	const statusBadge = statusBadgeClass(row.status);
	const bodyPreview =
		escapeHtml(row.body).slice(0, 60) + (row.body.length > 60 ? "…" : "");
	const errorPreview =
		row.status === "failed" && row.error
			? escapeHtml(row.error).slice(0, 80) + (row.error.length > 80 ? "…" : "")
			: "";

	return `<tr class="border-b border-cream-200 hover:bg-cream-50 transition-colors">
    <td class="px-2 py-2"><input type="checkbox" name="ids" value="${row.id}"></td>
    <td class="px-3 py-2 text-bark-muted whitespace-nowrap">${relativeTime(row.created_at)}</td>
    <td class="px-3 py-2 text-bark-light">${escapeHtml(row.channel)}</td>
    <td class="px-3 py-2 text-bark-light">${escapeHtml(row.subject ?? "")}</td>
    <td class="px-3 py-2 text-bark-light">${escapeHtml(row.recipient)}</td>
    <td class="px-3 py-2 text-bark-light">${bodyPreview}</td>
    <td class="px-3 py-2"><span class="${statusBadge} inline-block text-xs px-2 py-1 rounded font-medium">${row.status}</span></td>
    <td class="px-3 py-2 text-red-600 text-xs">${errorPreview}</td>
    <td class="px-2 py-2">
      <button
        type="button"
        class="text-bark-muted hover:text-red-600 transition-colors text-lg leading-none"
        title="Delete this message"
        data-delete-id="${row.id}"
        data-delete-page="${page}"
        data-delete-status="${statusVal}"
        onclick="const b=this;b.disabled=true;fetch('/outbox/delete',{method:'POST',body:new URLSearchParams({ids:b.dataset.deleteId,page:b.dataset.deletePage,status:b.dataset.deleteStatus})}).then(r=>{if(r.redirected)location.href=r.url})"
      >&times;</button>
    </td>
  </tr>`;
}

function bulkDeleteButton(): string {
	return `<div class="mb-2">
    <button type="submit" class="btn btn-secondary text-xs">Delete Selected</button>
  </div>`;
}

function statusBadgeClass(status: string): string {
	switch (status) {
		case "pending":
			return "bg-blue-100 text-blue-800";
		case "sending":
			return "bg-yellow-100 text-yellow-800";
		case "sent":
			return "bg-green-100 text-green-800";
		case "failed":
			return "bg-red-100 text-red-800";
		default:
			return "bg-cream-200 text-bark-muted";
	}
}

function paginationControls(
	page: number,
	totalPages: number,
	statusFilter: string | null,
): string {
	const statusParam = statusFilter ? `&status=${statusFilter}` : "";
	const prev =
		page > 1
			? `<a href="/outbox?page=${page - 1}${statusParam}" class="btn btn-secondary text-xs">← Prev</a>`
			: `<span class="btn btn-secondary text-xs opacity-40 cursor-not-allowed">← Prev</span>`;

	const next =
		page < totalPages
			? `<a href="/outbox?page=${page + 1}${statusParam}" class="btn btn-secondary text-xs">Next →</a>`
			: `<span class="btn btn-secondary text-xs opacity-40 cursor-not-allowed">Next →</span>`;

	return `<div class="flex items-center gap-2">${prev}${next}</div>`;
}

function relativeTime(iso: string): string {
	const now = Date.now();
	const then = new Date(iso).getTime();
	const diffMs = now - then;
	const diffMin = Math.floor(diffMs / 60_000);
	const diffHr = Math.floor(diffMs / 3_600_000);

	if (diffMin < 1) return "just now";
	if (diffMin < 60) return `${diffMin} min ago`;
	if (diffHr < 24) return `${diffHr} hr ago`;
	if (diffHr < 48) return "Yesterday";

	const d = new Date(iso);
	return d.toLocaleDateString("en-GB", {
		day: "numeric",
		month: "short",
		year: "numeric",
	});
}

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}
