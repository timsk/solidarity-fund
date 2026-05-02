import type { ApplicationRow } from "../../domain/application/repository.ts";

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

function panelWrapper(content: string): string {
	return `<div id="panel" class="panel">
  <div class="p-6">${content}</div>
</div>`;
}

function field(label: string, value: string): string {
	return `<div class="mb-4">
    <dt class="label">${label}</dt>
    <dd class="font-body text-bark">${escapeHtml(value)}</dd>
  </div>`;
}

function formatStatus(status: string): string {
	return status
		.split("_")
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
		.join(" ");
}

function formatPaymentPreference(pref: string): string {
	if (pref === "bank") return "Bank Transfer";
	if (pref === "cash") return "Cash";
	return pref;
}

function formatDateTime(iso: string | null): string {
	if (!iso) return "—";
	const d = new Date(iso);
	return `${d.toLocaleDateString("en-GB", {
		day: "numeric",
		month: "short",
		year: "numeric",
	})} at ${d.toLocaleTimeString("en-GB", {
		hour: "2-digit",
		minute: "2-digit",
	})}`;
}

function detailFields(
	app: ApplicationRow,
	reviewedByVolunteerName?: string | null,
): string {
	const fields = [
		field("Name", app.name ?? "—"),
		field("Phone", app.phone ?? "—"),
		...(app.email ? [field("Email", app.email)] : []),
		field("Status", formatStatus(app.status)),
		field("Payment Preference", formatPaymentPreference(app.paymentPreference)),
		...(app.meetingPlace ? [field("Meeting Place", app.meetingPlace)] : []),
		field("Lottery Name", app.lotteryName),
		field("Applied", formatDateTime(app.appliedAt)),
	];

	if (app.status === "confirmed" && app.acceptedAt) {
		const by = reviewedByVolunteerName ? ` by ${reviewedByVolunteerName}` : "";
		fields.push(
			field("Confirmed", `Confirmed${by} on ${formatDateTime(app.acceptedAt)}`),
		);
	} else if (app.acceptedAt) {
		fields.push(field("Accepted", formatDateTime(app.acceptedAt)));
	}

	if (app.selectedAt)
		fields.push(field("Selected", formatDateTime(app.selectedAt)));

	if (app.rejectedAt) {
		if (app.rejectReason === "identity_mismatch" && reviewedByVolunteerName) {
			fields.push(
				field(
					"Rejected",
					`Rejected by ${reviewedByVolunteerName} on ${formatDateTime(app.rejectedAt)}`,
				),
			);
		} else {
			fields.push(field("Rejected", formatDateTime(app.rejectedAt)));
		}
	}

	if (app.rank != null) fields.push(field("Lottery Rank", String(app.rank)));
	if (app.rejectReason) fields.push(field("Reject Reason", app.rejectReason));

	if (app.sortCode) fields.push(field("Sort Code", app.sortCode));
	if (app.accountNumber)
		fields.push(field("Account Number", app.accountNumber));

	if (app.poaRef) {
		fields.push(
			`<div class="mb-4">
    <dt class="label">Proof of Address</dt>
    <dd><a href="/applications/${encodeURIComponent(app.id)}/documents/poa" target="_blank" class="text-sm text-blue-600 hover:text-blue-800 underline">View document</a></dd>
  </div>`,
		);
	}

	return fields.join("\n");
}

function applicantLink(applicantId: string | null): string {
	if (!applicantId) return "";
	return `<button data-on:click="@get('/applicants/${encodeURIComponent(applicantId)}/edit')" class="text-sm text-blue-600 hover:text-blue-800 underline">View Applicant</button>`;
}

function panelWithTabs(
	title: string,
	app: ApplicationRow,
	applicantId: string | null,
	reviewedByVolunteerName: string | null | undefined,
	extraContent: string,
): string {
	return panelWrapper(`
    <div data-signals="{activeTab: 'details', historyLoaded: false}">
    <div class="flex items-center justify-between mb-6">
      <div class="flex items-center gap-3">
        <h2 class="font-heading font-bold text-xl text-bark">${escapeHtml(title)}</h2>
        ${applicantLink(applicantId)}
      </div>
      <button class="btn btn-secondary" data-on:click="@get('/applications/close')">Close</button>
    </div>
    <div class="flex gap-1 mb-4 border-b border-cream-200">
      <button type="button"
        class="tab"
        data-class:border-amber="$activeTab==='details'"
        data-class:text-amber="$activeTab==='details'"
        data-on:click="$activeTab='details'">Details</button>
      <button type="button"
        class="tab"
        data-class:border-amber="$activeTab==='history'"
        data-class:text-amber="$activeTab==='history'"
        data-on:click="$activeTab='history'; if(!$historyLoaded){$historyLoaded=true; @get('/applications/${encodeURIComponent(app.id)}/history')}">History</button>
    </div>
    <div data-show="$activeTab=='details'">
      <dl>
        ${detailFields(app, reviewedByVolunteerName)}
      </dl>
      ${extraContent}
    </div>
    <div data-show="$activeTab=='history'" style="display:none">
      <div id="history-content" class="py-8 text-center text-bark-muted text-sm">Loading...</div>
    </div>
    </div>
  `);
}

export function viewPanel(
	app: ApplicationRow,
	applicantId: string | null = null,
	reviewedByVolunteerName?: string | null,
): string {
	return panelWithTabs(
		app.name ?? "Application",
		app,
		applicantId,
		reviewedByVolunteerName,
		"",
	);
}

export function revertablePanel(
	app: ApplicationRow,
	applicantId: string | null = null,
	reviewedByVolunteerName?: string | null,
): string {
	return panelWithTabs(
		app.name ?? "Application",
		app,
		applicantId,
		reviewedByVolunteerName,
		`<div class="mt-6 p-4 bg-amber-50 border border-amber-200 rounded">
      <p class="text-sm text-amber-700 mb-3">This application has been ${app.status === "confirmed" ? "confirmed" : "rejected"}. You can revert this decision if needed.</p>
      <button class="btn btn-danger" data-on:click="@post('/applications/${encodeURIComponent(app.id)}/revert-review')">Revert Decision</button>
    </div>`,
	);
}

export function reviewPanel(
	app: ApplicationRow,
	applicantId: string | null = null,
	reviewedByVolunteerName?: string | null,
): string {
	const context =
		app.status === "flagged"
			? "This application was flagged for manual review."
			: "This application passed automated eligibility checks. No action needed, but you can confirm or reject if something looks wrong.";

	return panelWithTabs(
		app.name ?? "Review Application",
		app,
		applicantId,
		reviewedByVolunteerName,
		`<div class="mt-6 p-4 bg-amber-50 border border-amber-200 rounded">
      <p class="text-sm text-amber-700 mb-3">${context}</p>
      <div class="flex gap-3">
        <button class="btn btn-primary" data-on:click="@post('/applications/${encodeURIComponent(app.id)}/review?decision=confirm')">Confirm</button>
        <button class="btn btn-danger" data-on:click="@post('/applications/${encodeURIComponent(app.id)}/review?decision=reject')">Reject</button>
      </div>
    </div>`,
	);
}
