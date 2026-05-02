import { getFundName } from "../../config.ts";
import type { Volunteer } from "../../domain/volunteer/types.ts";
import { layout } from "./layout.ts";

export function dashboardPage(volunteer: Volunteer): string {
	return layout(
		"Dashboard",
		`
	<div class="max-w-2xl mx-auto px-4 py-8">
		<div class="flex items-center justify-between mb-8">
			<div class="flex items-center gap-3">
				<img src="/solidarity.png" alt="" class="w-9 h-9 rounded-full object-cover">
				<h1 class="font-heading font-bold text-2xl">${escapeHtml(getFundName())}</h1>
			</div>
			<form method="POST" action="/logout" class="inline">
				<button type="submit" class="btn btn-secondary text-bark-muted">Sign Out</button>
			</form>
		</div>

		<p class="text-bark-muted mb-8">Hello, ${escapeHtml(volunteer.name)}.</p>

		<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
			${navCard("/applicants", "\u{1F465}", "Applicants", "View and manage applicants")}
			${navCard("/applications", "\u{1F4DD}", "Applications", "Review incoming applications")}
			${navCard("/grants", "\u{1F4B7}", "Grants", "Track grant payments")}
			${navCard("/lottery", "\u{1F3B2}", "Lottery", "Run lottery")}
			${volunteer.isAdmin ? navCard("/volunteers", "\u{1F9D1}\u{200D}\u{1F91D}\u{200D}\u{1F9D1}", "Volunteers", "Manage volunteer accounts") : ""}
		${volunteer.isAdmin ? navCard("/logs", "\u{1F4CB}", "Event Log", "Diagnostic event history") : ""}
		${volunteer.isAdmin ? navCard("/outbox", "\u{1F4E8}", "Outbox", "View queued outbound messages") : ""}
		${volunteer.isAdmin ? navCard("/download-db", "\u{1F4BE}", "Download DB", "Download a backup of the database") : ""}
		</div>
	</div>
`,
	);
}

function navCard(
	href: string,
	icon: string,
	title: string,
	description: string,
): string {
	return `<a href="${href}" class="nav-card">
	<span class="text-2xl block mb-2">${icon}</span>
	<h3 class="font-heading font-semibold text-bark mb-1">${title}</h3>
	<p class="text-sm text-bark-muted leading-relaxed">${description}</p>
</a>`;
}

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}
