import type { GrantRow } from "../../domain/grant/repository.ts";
import { layout } from "./layout.ts";

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

const COLUMNS = [
	{
		statuses: ["awaiting_review", "offered_cash_alternative"],
		label: "Awaiting Review",
		color: "bg-amber-50 border-amber-200",
	},
	{
		statuses: ["poa_approved", "awaiting_cash_handover"],
		label: "Awaiting Payment",
		color: "bg-blue-50 border-blue-200",
	},
	{
		statuses: ["paid", "awaiting_reimbursement"],
		label: "Paid",
		color: "bg-green-50 border-green-200",
	},
	{
		statuses: ["reimbursed", "released"],
		label: "Complete",
		color: "bg-emerald-50 border-emerald-200",
	},
] as const;

function paymentBadge(pref: string): string {
	if (pref === "bank") {
		return `<span class="badge bg-blue-50 text-blue-700 border-blue-200">Bank</span>`;
	}
	return `<span class="badge bg-green-50 text-green-700 border-green-200">Cash</span>`;
}

function grantCard(grant: GrantRow): string {
	const name = escapeHtml(grant.applicantName ?? "Unknown");
	const volunteer = grant.volunteerName
		? escapeHtml(grant.volunteerName)
		: `<span class="text-bark-muted italic">Unassigned</span>`;

	return `<div
		class="bg-white rounded-lg border border-cream-200 p-3 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
		data-on:click="@get('/grants/${encodeURIComponent(grant.id)}')">
		<div class="flex items-center justify-between mb-1.5">
			<span class="font-heading font-semibold text-sm text-bark">${name}</span>
			<span class="text-xs text-bark-muted font-mono">#${grant.rank}</span>
		</div>
		<div class="flex items-center justify-between">
			${paymentBadge(grant.paymentPreference)}
			<span class="text-xs text-bark-muted">${volunteer}</span>
		</div>
	</div>`;
}

function kanbanColumn(
	col: (typeof COLUMNS)[number],
	grants: GrantRow[],
): string {
	const matching = grants.filter((g) =>
		(col.statuses as readonly string[]).includes(g.status),
	);
	const count = matching.length;
	const cards = matching.map(grantCard).join("\n");

	return `<div class="flex flex-col min-w-[220px] max-w-[260px]">
		<div class="rounded-t-lg border ${col.color} px-3 py-2 mb-0">
			<div class="flex items-center justify-between">
				<h3 class="font-heading font-semibold text-xs uppercase tracking-wide text-bark">${col.label}</h3>
				<span class="badge bg-white text-bark-muted border-cream-200">${count}</span>
			</div>
		</div>
		<div class="flex-1 bg-cream-50 border-x border-b border-cream-200 rounded-b-lg p-2 space-y-2 min-h-[120px]">
			${cards}
		</div>
	</div>`;
}

export function grantsBoard(grants: GrantRow[]): string {
	return `<div id="grants-board" class="flex gap-3 overflow-x-auto pb-4">
		${COLUMNS.map((col) => kanbanColumn(col, grants)).join("\n")}
	</div>`;
}

export function grantsPage(
	grants: GrantRow[],
	lotteries: string[],
	currentLottery: string,
): string {
	const lotteryOptions = lotteries
		.map(
			(m) =>
				`<option value="${escapeHtml(m)}"${m === currentLottery ? " selected" : ""}>${escapeHtml(m)}</option>`,
		)
		.join("\n");

	const body = `<div class="max-w-[1800px] mx-auto px-4 py-8" data-signals='${escapeHtml(JSON.stringify({ lottery: currentLottery }))}'>
	<div class="flex items-center justify-between mb-6">
		<div class="flex items-center gap-3">
			<a href="/" class="text-bark-muted hover:text-bark transition-colors text-sm">&larr; Back</a>
			<h1 class="font-heading text-2xl font-semibold text-bark">Grants</h1>
		</div>
		<select
			data-bind:lottery
			data-on:change="@get('/grants?lottery=' + $lottery)"
			class="input max-w-48 bg-white text-sm">
			${lotteryOptions}
		</select>
	</div>

	${grantsBoard(grants)}

	<div id="panel"></div>
</div>`;

	return layout("Grants", body);
}
