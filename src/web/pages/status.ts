import { getFundName } from "../../config.ts";
import type { ApplicationRow } from "../../domain/application/repository.ts";
import type { GrantRow } from "../../domain/grant/repository.ts";

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

function publicLayout(title: string, body: string): string {
	return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(getFundName())} - ${escapeHtml(title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=Source+Serif+4:wght@400;600&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/styles/app.css">
  <style>
    body { background-image: url("data:image/svg+xml,%3Csvg width='40' height='40' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 0h40v40H0z' fill='none'/%3E%3Cpath d='M20 20.5c0-.3.2-.5.5-.5s.5.2.5.5-.2.5-.5.5-.5-.2-.5-.5z' fill='%23d4c9b4' fill-opacity='.3'/%3E%3C/svg%3E"); }
  </style>
</head>
<body class="font-body bg-cream-100 text-bark min-h-screen flex items-center justify-center p-4">
${body}
</body>
</html>`;
}

type StepStatus = "done" | "current" | "current-purple" | "failed" | "future";

type Step = {
	label: string;
	note?: string;
	status: StepStatus;
};

function stepDot(status: StepStatus): string {
	switch (status) {
		case "done":
			return `<div class="w-6 h-6 rounded-full bg-green-600 flex items-center justify-center flex-shrink-0 text-white text-xs">✓</div>`;
		case "current":
			return `<div class="w-6 h-6 rounded-full bg-amber-500 flex items-center justify-center flex-shrink-0 text-white text-xs font-bold">⋯</div>`;
		case "current-purple":
			return `<div class="w-6 h-6 rounded-full bg-purple-600 flex items-center justify-center flex-shrink-0 text-white text-xs font-bold">⋯</div>`;
		case "failed":
			return `<div class="w-6 h-6 rounded-full bg-red-500/20 border-2 border-red-500 flex items-center justify-center flex-shrink-0 text-red-500 text-xs font-bold">✗</div>`;
		case "future":
			return `<div class="w-6 h-6 rounded-full bg-cream-200 border-2 border-bark-muted/30 flex items-center justify-center flex-shrink-0 text-bark-muted text-xs">○</div>`;
	}
}

function stepLabel(step: Step): string {
	const color =
		step.status === "done"
			? "text-bark font-semibold"
			: step.status === "current"
				? "text-amber-700 font-semibold"
				: step.status === "current-purple"
					? "text-purple-700 font-semibold"
					: step.status === "failed"
						? "text-red-600 font-semibold"
						: "text-bark-muted";
	return `<span class="text-sm ${color}">${escapeHtml(step.label)}</span>
${step.note ? `<span class="text-xs text-bark-muted block mt-0.5">${escapeHtml(step.note)}</span>` : ""}`;
}

function renderTimeline(steps: Step[]): string {
	return steps
		.map((step, i) => {
			const isLast = i === steps.length - 1;
			return `<div class="flex gap-3 items-start">
    <div class="flex flex-col items-center">
      ${stepDot(step.status)}
      ${!isLast ? `<div class="w-0.5 flex-1 min-h-[20px] bg-bark-muted/20 my-1"></div>` : ""}
    </div>
    <div class="pb-4 pt-0.5">
      ${stepLabel(step)}
    </div>
  </div>`;
		})
		.join("\n");
}

function rejectionMessage(reason: string | null): string {
	switch (reason) {
		case "window_closed":
			return "Applications are currently closed";
		case "cooldown":
			return "You've received a grant recently and are not yet eligible to apply again. Please try later.";
		case "duplicate":
			return "An application has already been submitted for this contact";
		default:
			return "Your application was not accepted";
	}
}

function buildSteps(app: ApplicationRow, grant: GrantRow | null): Step[] {
	const applied: Step = { label: "Applied", status: "done" };

	// Pre-lottery: rejected
	if (app.status === "rejected") {
		return [
			applied,
			{
				label: "Not eligible",
				note: rejectionMessage(app.rejectReason),
				status: "failed",
			},
		];
	}

	// Pre-lottery: flagged for identity check
	if (app.status === "flagged") {
		return [
			applied,
			{
				label: "Identity check",
				note: "A volunteer is reviewing your details",
				status: "current-purple",
			},
			{ label: "Lottery draw", status: "future" },
			{ label: "Grant outcome", status: "future" },
		];
	}

	// Pre-lottery: confirmed after identity check
	if (app.status === "confirmed") {
		return [
			applied,
			{ label: "Identity check", status: "done" },
			{
				label: "Lottery draw",
				note: "You're in the pool",
				status: "current",
			},
			{ label: "Grant outcome", status: "future" },
		];
	}

	// Pre-lottery: in pool (applied or accepted)
	if (app.status === "applied" || app.status === "accepted") {
		return [
			applied,
			{
				label: "Lottery draw",
				note: "You're in the pool",
				status: "current",
			},
			{ label: "Grant outcome", status: "future" },
		];
	}

	// Post-lottery: not selected
	if (app.status === "not_selected") {
		return [
			applied,
			{ label: "Lottery draw", status: "done" },
			{
				label: "Not selected",
				note: "You can apply again next month",
				status: "failed",
			},
		];
	}

	// Post-lottery: selected — map grant state
	const selected: Step = { label: "Selected 🎉", status: "done" };

	// No grant record yet
	if (!grant || grant.status === "initial") {
		return [
			applied,
			selected,
			{ label: "Volunteer being assigned", status: "current" },
			{ label: "Payment", status: "future" },
		];
	}

	const hasVolunteer = !!grant.volunteerId;
	const volunteerAssigned: Step = {
		label: "Volunteer assigned",
		status: "done",
	};
	const paid: Step = { label: "Payment received", status: "done" };

	switch (grant.status) {
		case "awaiting_bank_details":
			if (!hasVolunteer) {
				return [
					applied,
					selected,
					{ label: "Volunteer being assigned", status: "current" },
					{ label: "Payment", status: "future" },
				];
			}
			return [
				applied,
				selected,
				volunteerAssigned,
				{ label: "Payment details needed", status: "current" },
				{ label: "Paid", status: "future" },
			];

		case "bank_details_submitted":
			return [
				applied,
				selected,
				volunteerAssigned,
				{ label: "Proof of address being reviewed", status: "current" },
				{ label: "Paid", status: "future" },
			];

		case "poa_approved":
			return [
				applied,
				selected,
				volunteerAssigned,
				{ label: "Proof of address approved", status: "done" },
				{ label: "Payment being processed", status: "current" },
				{ label: "Paid", status: "future" },
			];

		case "offered_cash_alternative":
			return [
				applied,
				selected,
				volunteerAssigned,
				{ label: "Cash alternative arranged", status: "current" },
				{ label: "Paid", status: "future" },
			];

		case "awaiting_cash_handover":
			if (!hasVolunteer) {
				return [
					applied,
					selected,
					{ label: "Volunteer being assigned", status: "current" },
					{ label: "Payment", status: "future" },
				];
			}
			return [
				applied,
				selected,
				volunteerAssigned,
				{ label: "Cash handover pending", status: "current" },
				{ label: "Paid", status: "future" },
			];

		case "paid":
			// DB status "paid" is always bank (cash goes to awaiting_reimbursement)
			return [
				applied,
				selected,
				volunteerAssigned,
				{ label: "Payment processed", status: "done" },
				paid,
			];

		case "awaiting_reimbursement":
		case "reimbursed":
			// Cash payment complete from applicant's perspective
			return [
				applied,
				selected,
				volunteerAssigned,
				{ label: "Cash handover complete", status: "done" },
				paid,
			];

		case "released":
			if (hasVolunteer) {
				return [
					applied,
					selected,
					volunteerAssigned,
					{
						label: "Slot released",
						note: "Your grant slot was released. You can apply again next month.",
						status: "failed",
					},
				];
			}
			return [
				applied,
				selected,
				{
					label: "Slot released",
					note: "Your grant slot was released. You can apply again next month.",
					status: "failed",
				},
			];

		default:
			return [
				applied,
				selected,
				{ label: "Grant in progress", status: "current" },
			];
	}
}

export function statusLookupPage(error?: string): string {
	const errorHtml = error
		? `<p class="text-red-600 text-sm font-body mb-4">${escapeHtml(error)}</p>`
		: "";
	return publicLayout(
		"Check Application Status",
		`<div class="w-full max-w-md">
  <div class="card p-8">
    <h1 class="font-heading text-2xl font-bold text-bark mb-2 text-center">Check Your Status</h1>
    <p class="text-bark-muted font-body text-sm text-center mb-6">Enter the reference number from your application confirmation.</p>
    ${errorHtml}
    <form action="/status" method="GET" class="space-y-4">
      <div>
        <label for="ref" class="block text-sm font-body text-bark mb-1">Your reference number</label>
        <input
          type="text"
          id="ref"
          name="ref"
          required
          placeholder="e.g. 1234"
          class="input font-mono"
        />
      </div>
      <button type="submit" class="btn-primary w-full">Check status</button>
    </form>
  </div>
</div>`,
	);
}

export function statusTimelinePage(
	app: ApplicationRow,
	grant: GrantRow | null,
): string {
	const steps = buildSteps(app, grant);
	const timeline = renderTimeline(steps);
	return publicLayout(
		"Application Status",
		`<div class="w-full max-w-md">
  <div class="card p-8">
    <h1 class="font-heading text-2xl font-bold text-bark mb-1 text-center">Application Status</h1>
    <p class="text-bark-muted font-body text-xs text-center mb-6">Ref: <span class="font-mono">${app.ref}</span></p>
    <div class="space-y-0">
      ${timeline}
    </div>
    <div class="mt-6 pt-4 border-t border-bark-muted/20 text-center">
      <a href="/status" class="text-xs text-bark-muted underline font-body">Check a different reference</a>
    </div>
  </div>
</div>`,
	);
}
