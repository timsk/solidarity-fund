import type {
	ApplicationFilters,
	ApplicationRow,
} from "../../domain/application/repository.ts";
import { layout } from "./layout.ts";

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

function formatDate(iso: string): string {
	return new Date(iso).toLocaleDateString("en-GB", {
		day: "numeric",
		month: "short",
		year: "numeric",
	});
}

// fallow-ignore-next-line unused-exports
export function statusBadge(status: string): string {
	const colors: Record<string, string> = {
		accepted: "bg-blue-50 text-blue-700 border-blue-200",
		confirmed: "bg-blue-50 text-blue-700 border-blue-200",
		flagged: "bg-amber-50 text-amber-700 border-amber-200",
		rejected: "bg-red-50 text-red-700 border-red-200",
		selected: "bg-green-50 text-green-700 border-green-200",
		not_selected: "bg-gray-50 text-gray-600 border-gray-200",
		applied: "bg-cream-100 text-bark-muted border-cream-200",
	};
	const cls = colors[status] ?? "bg-gray-50 text-gray-600 border-gray-200";
	const label = status
		.replace(/_/g, " ")
		.replace(/\b\w/g, (c) => c.toUpperCase());
	return `<span class="badge ${cls}">${escapeHtml(label)}</span>`;
}

function paymentBadge(pref: string): string {
	if (pref === "bank") {
		return `<span class="badge bg-blue-50 text-blue-700 border-blue-200">Bank</span>`;
	}
	return `<span class="badge bg-green-50 text-green-700 border-green-200">Cash</span>`;
}

// fallow-ignore-next-line unused-exports
export function applicationRow(a: ApplicationRow): string {
	return `<tr
		class="table-row"
		data-on:click="@get('/applications/${encodeURIComponent(a.id)}')">
		<td class="px-4 py-3 font-medium text-bark">${escapeHtml(a.name ?? "")}</td>
		<td class="px-4 py-3 text-bark-muted">${escapeHtml(a.phone ?? "")}</td>
		<td class="px-4 py-3">${statusBadge(a.status)}</td>
		<td class="px-4 py-3">${paymentBadge(a.paymentPreference)}</td>
		<td class="px-4 py-3 text-bark-muted text-sm">${a.appliedAt ? formatDate(a.appliedAt) : ""}</td>
		<td class="px-4 py-3">
			<a
				href="/status?ref=${a.ref}"
				target="_blank"
				class="text-xs text-bark-muted underline hover:text-bark"
				title="View applicant status page"
				onclick="event.stopPropagation()"
			>Status ↗</a>
		</td>
	</tr>`;
}

export function applicationsTableBody(applications: ApplicationRow[]): string {
	const emptyRow = `<tr><td colspan="6" class="text-center py-12 text-bark-muted">No applications for this month</td></tr>`;
	const rows =
		applications.length === 0
			? emptyRow
			: applications.map(applicationRow).join("\n");
	return `<tbody id="application-rows">${rows}</tbody>`;
}

// fallow-ignore-next-line unused-exports
export const STATUS_OPTIONS = [
	{ value: "all", label: "All Statuses" },
	{ value: "applied", label: "Applied" },
	{ value: "accepted", label: "Accepted" },
	{ value: "confirmed", label: "Confirmed" },
	{ value: "flagged", label: "Flagged" },
	{ value: "rejected", label: "Rejected" },
	{ value: "selected", label: "Selected" },
	{ value: "not_selected", label: "Not Selected" },
];

const PAYMENT_OPTIONS = [
	{ value: "all", label: "All Payments" },
	{ value: "bank", label: "Bank" },
	{ value: "cash", label: "Cash" },
];

function filterUrl(): string {
	return "'/applications?lottery=' + $lottery + '&status=' + $status + '&payment=' + $payment";
}

export function applicationsPage(
	applications: ApplicationRow[],
	lotteries: string[],
	currentLottery: string,
	filters?: ApplicationFilters,
): string {
	const currentStatus = filters?.status ?? "all";
	const currentPayment = filters?.paymentPreference ?? "all";

	const lotteryOptions = lotteries
		.map(
			(m) =>
				`<option value="${escapeHtml(m)}"${m === currentLottery ? " selected" : ""}>${escapeHtml(m)}</option>`,
		)
		.join("\n");

	const statusOptions = STATUS_OPTIONS.map(
		(o) =>
			`<option value="${o.value}"${o.value === currentStatus ? " selected" : ""}>${o.label}</option>`,
	).join("\n");

	const paymentOptions = PAYMENT_OPTIONS.map(
		(o) =>
			`<option value="${o.value}"${o.value === currentPayment ? " selected" : ""}>${o.label}</option>`,
	).join("\n");

	const body = `<div class="max-w-5xl mx-auto px-4 py-8" data-signals='{"lottery": "${escapeHtml(currentLottery)}", "status": "${escapeHtml(currentStatus)}", "payment": "${escapeHtml(currentPayment)}"}'>
	<div class="flex items-center justify-between mb-6">
		<div class="flex items-center gap-3">
			<a href="/" class="text-bark-muted hover:text-bark transition-colors text-sm">&larr; Back</a>
			<h1 class="font-heading text-2xl font-semibold text-bark">Applications</h1>
		</div>
		<div class="flex items-center gap-2">
			<select
				data-bind:lottery
				data-on:change="@get(${filterUrl()})"
				class="input max-w-48 bg-white text-sm">
				${lotteryOptions}
			</select>
			<select
				data-bind:status
				data-on:change="@get(${filterUrl()})"
				class="input max-w-48 bg-white text-sm">
				${statusOptions}
			</select>
			<select
				data-bind:payment
				data-on:change="@get(${filterUrl()})"
				class="input max-w-48 bg-white text-sm">
				${paymentOptions}
			</select>
		</div>
	</div>

	<div class="card">
		<div class="overflow-x-auto">
			<table class="w-full text-left border-collapse">
				<thead>
					<tr class="border-b-2 border-cream-300 bg-cream-100">
						<th class="th">Name</th>
						<th class="th">Phone</th>
						<th class="th">Status</th>
						<th class="th">Payment</th>
						<th class="th">Applied</th>
						<th class="px-4 py-3 text-left text-xs font-medium text-bark-muted uppercase tracking-wider">Status page</th>
					</tr>
				</thead>
				${applicationsTableBody(applications)}
			</table>
		</div>
	</div>

	<div id="panel"></div>
</div>`;

	return layout("Applications", body);
}
