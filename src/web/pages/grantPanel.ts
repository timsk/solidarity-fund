import type { GrantRow } from "../../domain/grant/repository.ts";
import type { Volunteer } from "../../domain/volunteer/types.ts";

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

function formatDate(iso: string | null): string {
	if (!iso) return "—";
	return new Date(iso).toLocaleDateString("en-GB", {
		day: "numeric",
		month: "short",
		year: "numeric",
	});
}

function escapeSignalValue(s: string): string {
	return s
		.replace(/\\/g, "\\\\")
		.replace(/'/g, "\\'")
		.replace(/\n/g, "\\n")
		.replace(/<\//g, "<\\/")
		.replace(/</g, "\\u003C")
		.replace(/>/g, "\\u003E");
}

function formatStatus(status: string): string {
	return status
		.split("_")
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
		.join(" ");
}

function panelWrapper(content: string): string {
	return `<div id="panel" class="panel">
  <div class="p-6">${content}</div>
</div>`;
}

function field(label: string, value: string): string {
	return `<div class="mb-3">
    <dt class="label">${label}</dt>
    <dd class="font-body text-bark">${value}</dd>
  </div>`;
}

function panelHeader(grant: GrantRow): string {
	const name = escapeHtml(grant.applicantName ?? "Grant");
	return `<div class="flex items-center justify-between mb-6">
		<h2 class="font-heading font-bold text-xl text-bark">${name} <span class="text-bark-muted font-normal text-sm">#${grant.rank}</span></h2>
		<button class="btn btn-secondary" data-on:click="@get('/grants/close')">Close</button>
	</div>`;
}

function commonFields(grant: GrantRow): string {
	const fields = [
		field("Status", formatStatus(grant.status)),
		field(
			"Payment Preference",
			grant.paymentPreference === "bank" ? "Bank Transfer" : "Cash",
		),
		field("Lottery Name", grant.lotteryName),
		field(
			"Volunteer",
			grant.volunteerName
				? escapeHtml(grant.volunteerName)
				: "<em>Unassigned</em>",
		),
	];
	if (grant.applicantPhone) {
		fields.push(field("Phone", escapeHtml(grant.applicantPhone)));
	}
	return fields.join("\n");
}

function bankDetailFields(grant: GrantRow): string {
	if (!grant.sortCode && !grant.accountNumber) return "";
	return [
		grant.sortCode ? field("Sort Code", escapeHtml(grant.sortCode)) : "",
		grant.accountNumber
			? field("Account Number", escapeHtml(grant.accountNumber))
			: "",
	]
		.filter(Boolean)
		.join("\n");
}

function assignVolunteerForm(grant: GrantRow, volunteers: Volunteer[]): string {
	const options = volunteers
		.filter((v) => !v.isDisabled)
		.map(
			(v) =>
				`<option value="${escapeHtml(v.id)}"${v.id === grant.volunteerId ? " selected" : ""}>${escapeHtml(v.name)}</option>`,
		)
		.join("\n");

	return `<div class="mt-4 p-3 bg-cream-100 rounded-lg border border-cream-200">
		<label class="label">Assign Volunteer</label>
		<div class="flex gap-2" data-signals='${escapeHtml(JSON.stringify({ assignvolunteerid: grant.volunteerId ?? "" }))}'>
			<select data-bind:assignvolunteerid class="input text-sm flex-1">
				<option value="">Select volunteer...</option>
				${options}
			</select>
			<button class="btn btn-primary text-sm"
				data-on:click="@post('/grants/${encodeURIComponent(grant.id)}/assign-volunteer?volunteerId=' + $assignvolunteerid)">
				Assign
			</button>
		</div>
	</div>`;
}

function releaseSlotForm(grant: GrantRow): string {
	return `<div class="mt-4 p-3 bg-red-50 rounded-lg border border-red-200">
		<label class="label">Release Slot</label>
		<div data-signals='{"releasereason": ""}'>
			<input type="text" data-bind:releasereason class="input text-sm mb-2" placeholder="Reason for release..." />
			<button class="btn btn-danger text-sm w-full"
				data-on:click="@post('/grants/${encodeURIComponent(grant.id)}/release?reason=' + $releasereason)">
				Release Slot
			</button>
		</div>
	</div>`;
}

function editBankDetailsForm(grant: GrantRow): string {
	const signals = escapeHtml(
		JSON.stringify({
			editsortcode: grant.sortCode ?? "",
			editaccountnumber: grant.accountNumber ?? "",
		}),
	);
	return `<div class="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
		<h3 class="font-heading font-semibold text-sm mb-3">Edit Bank Details</h3>
		<div data-signals='${signals}'>
			<div class="space-y-2 mb-2">
				<div>
					<label class="label">Sort Code</label>
					<input type="text" data-bind:editsortcode class="input text-sm" placeholder="12-34-56" />
				</div>
				<div>
					<label class="label">Account Number</label>
					<input type="text" data-bind:editaccountnumber class="input text-sm" placeholder="12345678" />
				</div>
			</div>
			<button class="btn btn-primary text-sm w-full"
				data-on:click="@post('/grants/${encodeURIComponent(grant.id)}/update-bank-details')">
				Save
			</button>
		</div>
	</div>`;
}

function poaReviewSection(grant: GrantRow, hasDocument: boolean): string {
	const poaImage = hasDocument
		? `<div class="mb-3">
			<label class="label">Proof of Address</label>
			<a href="/grants/${encodeURIComponent(grant.id)}/documents/poa" target="_blank"
				class="text-sm text-blue-600 hover:text-blue-800 underline">View Document</a>
		</div>`
		: "";

	return `${poaImage}
	<div class="flex gap-2 mt-4">
		<button class="btn btn-primary flex-1"
			data-on:click="@post('/grants/${encodeURIComponent(grant.id)}/approve-poa')">
			Approve POA
		</button>
		<button class="btn btn-danger flex-1"
			data-on:click="@post('/grants/${encodeURIComponent(grant.id)}/reject-poa')">
			Reject POA
		</button>
	</div>
	<p class="text-xs text-bark-muted mt-2">POA attempts: ${grant.poaAttempts}</p>`;
}

function recordPaymentForm(grant: GrantRow, method: "bank" | "cash"): string {
	return `<div class="mt-4 p-3 bg-green-50 rounded-lg border border-green-200">
		<h3 class="font-heading font-semibold text-sm mb-3">Record Payment</h3>
		<div data-signals='{"paymentamount": ""}'>
			<div class="mb-2">
				<label class="label">Amount (£)</label>
				<input type="number" data-bind:paymentamount class="input text-sm" placeholder="0.00" step="0.01" />
			</div>
			<button class="btn btn-primary text-sm w-full"
				data-on:click="@post('/grants/${encodeURIComponent(grant.id)}/record-payment?amount=' + $paymentamount + '&method=${method}')">
				Record Payment
			</button>
		</div>
	</div>`;
}

function cashAlternativeActions(grant: GrantRow): string {
	return `<div class="flex gap-2 mt-4">
		<button class="btn btn-primary flex-1"
			data-on:click="@post('/grants/${encodeURIComponent(grant.id)}/accept-cash')">
			Accept Cash
		</button>
		<button class="btn btn-danger flex-1"
			data-on:click="@post('/grants/${encodeURIComponent(grant.id)}/decline-cash')">
			Decline Cash
		</button>
	</div>`;
}

function reimbursementForm(grant: GrantRow): string {
	return `<div class="mt-4 p-3 bg-purple-50 rounded-lg border border-purple-200">
		<h3 class="font-heading font-semibold text-sm mb-3">Record Reimbursement</h3>
		<div data-signals='{"expenseref": ""}'>
			<div class="mb-2">
				<label class="label">Expense Reference</label>
				<input type="text" data-bind:expenseref class="input text-sm" placeholder="OC-123" />
			</div>
			<button class="btn btn-primary text-sm w-full"
				data-on:click="@post('/grants/${encodeURIComponent(grant.id)}/record-reimbursement?expenseReference=' + $expenseref)">
				Record Reimbursement
			</button>
		</div>
	</div>`;
}

function paymentDetailFields(grant: GrantRow): string[] {
	const method =
		grant.paymentMethod === "bank"
			? "Bank Transfer"
			: grant.paymentMethod === "cash"
				? "Cash"
				: "—";
	const fields = [
		field("Amount", grant.amount != null ? `£${grant.amount.toFixed(2)}` : "—"),
		field("Method", method),
		field("Paid", formatDate(grant.paidAt)),
	];
	if (grant.paidBy) {
		fields.push(field("Paid By", escapeHtml(grant.paidBy)));
	}
	return fields;
}

function paymentDetails(grant: GrantRow): string {
	return paymentDetailFields(grant).join("\n");
}

function reimbursementDetails(grant: GrantRow): string {
	return [
		...paymentDetailFields(grant),
		field("Expense Reference", escapeHtml(grant.expenseReference ?? "—")),
		field("Reimbursed", formatDate(grant.reimbursedAt)),
	].join("\n");
}

export function grantPanel(
	grant: GrantRow,
	volunteers: Volunteer[],
	hasDocument: boolean,
): string {
	let actions = "";

	switch (grant.status) {
		case "awaiting_review":
			actions = [
				bankDetailFields(grant),
				poaReviewSection(grant, hasDocument),
				editBankDetailsForm(grant),
				assignVolunteerForm(grant, volunteers),
				releaseSlotForm(grant),
			].join("\n");
			break;

		case "awaiting_cash_handover":
			actions = [
				grant.volunteerId ? recordPaymentForm(grant, "cash") : "",
				assignVolunteerForm(grant, volunteers),
				releaseSlotForm(grant),
			].join("\n");
			break;

		case "offered_cash_alternative":
			actions = [
				cashAlternativeActions(grant),
				assignVolunteerForm(grant, volunteers),
				releaseSlotForm(grant),
			].join("\n");
			break;

		case "poa_approved":
			actions = [
				bankDetailFields(grant),
				grant.volunteerId ? recordPaymentForm(grant, "bank") : "",
				assignVolunteerForm(grant, volunteers),
				releaseSlotForm(grant),
			].join("\n");
			break;

		case "paid":
			actions = paymentDetails(grant);
			break;

		case "awaiting_reimbursement":
			actions = [paymentDetails(grant), reimbursementForm(grant)].join("\n");
			break;

		case "reimbursed":
			actions = reimbursementDetails(grant);
			break;

		case "released":
			actions = [
				field("Reason", escapeHtml(grant.releasedReason ?? "—")),
				field("Released", formatDate(grant.releasedAt)),
			].join("\n");
			break;
	}

	return panelWrapper(`
		${panelHeader(grant)}
		<dl>${commonFields(grant)}</dl>
		${actions}
		<div class="mt-6 border-t border-cream-200 pt-4" data-signals="{grantnotes: '${escapeSignalValue(grant.notes ?? "")}'}">
			<label class="label">Notes</label>
			<textarea class="input" rows="3" data-bind:grantnotes
				data-on:blur="@post('/grants/${encodeURIComponent(grant.id)}/notes')"></textarea>
		</div>
	`);
}

export function emptyPanel(): string {
	return `<div id="panel"></div>`;
}
