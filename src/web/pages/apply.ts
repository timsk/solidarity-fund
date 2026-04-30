import { getFundName } from "../../config.ts";

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
	<script async defer src="/scripts/altcha.js" type="module"></script>
	<script type="module" src="https://cdn.jsdelivr.net/gh/starfederation/datastar@v1.0.1/bundles/datastar.js"></script>
	<style>
		body { background-image: url("data:image/svg+xml,%3Csvg width='40' height='40' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 0h40v40H0z' fill='none'/%3E%3Cpath d='M20 20.5c0-.3.2-.5.5-.5s.5.2.5.5-.2.5-.5.5-.5-.2-.5-.5z' fill='%23d4c9b4' fill-opacity='.3'/%3E%3C/svg%3E"); }
	</style>
</head>
<body class="font-body bg-cream-100 text-bark min-h-screen flex items-center justify-center p-4">
${body}
</body>
</html>`;
}

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

function formatAppliedAt(iso: string): string {
	const d = new Date(iso);
	const hh = String(d.getHours()).padStart(2, "0");
	const mm = String(d.getMinutes()).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	const month = String(d.getMonth() + 1).padStart(2, "0");
	const year = d.getFullYear();
	return `${hh}:${mm} on ${day}/${month}/${year}`;
}

export function applyPage(closesAt: string): string {
	const countdownHtml = closesAt
		? `<div id="countdown" class="text-center mb-4 py-2 px-4 bg-bark/5 rounded-lg border border-bark/10">
			<span class="text-xs text-bark-muted uppercase tracking-wider">Expected to close in</span>
			<div class="font-mono text-lg font-bold text-bark tabular-nums" id="countdown-timer">--h --m --s</div>
		</div>
		<script>
		(function() {
			var end = new Date("${closesAt}").getTime();
			var el = document.getElementById("countdown-timer");
			var wrap = document.getElementById("countdown");
			function tick() {
				var now = Date.now();
				var diff = end - now;
				if (diff <= 0) {
					wrap.style.display = "none";
					return;
				}
				var h = Math.floor(diff / 3600000);
				var m = Math.floor((diff % 3600000) / 60000);
				var s = Math.floor((diff % 60000) / 1000);
				el.textContent = h + "h " + m + "m " + s + "s";
			}
			tick();
			setInterval(tick, 1000);
		})();
		</script>`
		: `<div class="text-center mb-4 py-2 px-4 bg-bark/5 rounded-lg border border-bark/10">
			<p class="text-sm text-bark-muted">Applications close when volunteers close the window</p>
		</div>`;

	return publicLayout(
		"Apply",
		`<div class="w-full max-w-md">
	<div class="card p-8">
		<h1 class="font-heading text-2xl font-bold text-bark mb-2 text-center">Apply for a grant of £40</h1>
		${countdownHtml}
		<form action="/apply" method="POST" enctype="multipart/form-data" class="space-y-4" data-signals='{"paymentPref": "cash"}'>
			<div>
				<label for="name" class="block text-sm font-body text-bark mb-1">Name <span class="text-red-500">*</span></label>
				<input type="text" id="name" name="name" required class="input" />
			</div>
			<div>
				<label for="email" class="block text-sm font-body text-bark mb-1">Email</label>
				<input type="email" id="email" name="email" class="input" />
			</div>
			<div>
				<label for="phone" class="block text-sm font-body text-bark mb-1">Phone <span class="text-red-500">*</span></label>
				<input type="tel" id="phone" name="phone" required class="input" />
			</div>
			<fieldset>
				<legend class="block text-sm font-body text-bark mb-2">Payment Preference</legend>
				<div class="space-y-2">
					<label class="flex items-center gap-2 cursor-pointer">
						<input type="radio" name="paymentPreference" value="cash" data-bind:payment-pref />
						<span class="text-sm text-bark">Cash</span>
					</label>
					<label class="flex items-center gap-2 cursor-pointer">
						<input type="radio" name="paymentPreference" value="bank" data-bind:payment-pref />
						<span class="text-sm text-bark">Bank transfer</span>
					</label>
				</div>
			</fieldset>
			<div id="cashFields" class="space-y-4" data-show="$paymentPref === 'cash'">
				<div>
					<label for="meetingPlace" class="block text-sm font-body text-bark mb-1">Meeting place or address <span class="text-red-500">*</span></label>
					<input type="text" id="meetingPlace" name="meetingPlace" data-attr:required="$paymentPref === 'cash' ? '' : null" class="input" />
				</div>
			</div>
			<div id="bankFields" class="space-y-4" data-show="$paymentPref === 'bank'" style="display:none;">
				<div>
					<label for="sortCode" class="block text-sm font-body text-bark mb-1">Sort Code <span class="text-red-500">*</span></label>
					<input type="text" id="sortCode" name="sortCode" class="input" placeholder="12-34-56" pattern="\\d{2}-?\\d{2}-?\\d{2}" title="Sort code must be 6 digits, e.g. 12-34-56 or 123456" data-attr:required="$paymentPref === 'bank' ? '' : null" />
				</div>
				<div>
					<label for="accountNumber" class="block text-sm font-body text-bark mb-1">Account Number <span class="text-red-500">*</span></label>
					<input type="text" id="accountNumber" name="accountNumber" class="input" placeholder="12345678" pattern="\\d{8}" title="Account number must be 8 digits" data-attr:required="$paymentPref === 'bank' ? '' : null" />
				</div>
				<div>
					<label for="poa" class="block text-sm font-body text-bark mb-1">Proof of Address</label>
					<p class="text-xs text-bark-muted mb-1">Optional — but attaching now speeds things up if you are selected.</p>
					<input type="file" id="poa" name="poa" accept="image/*,.pdf" class="input text-sm" />
				</div>
			</div>
			<div>
				<altcha-widget challenge="/api/altcha/challenge" hidefooter></altcha-widget>
			</div>
			<button type="submit" class="btn btn-primary w-full font-body">
				Submit Application
			</button>
		</form>
		<p class="text-xs text-bark-muted mt-4 text-center">
			Your information will be retained for 6 months and then automatically deleted.
			<a href="/privacy" class="underline hover:text-bark">Privacy Policy</a>
		</p>
	</div>
</div>`,
	);
}

export function applyClosedPage(): string {
	return publicLayout(
		"Applications Closed",
		`<div class="w-full max-w-md">
	<div class="card p-8 text-center">
		<h1 class="font-heading text-2xl font-bold text-bark mb-4">Applications Closed</h1>
		<p class="text-bark-muted font-body">The application window is currently closed. Please check back later.</p>
	</div>
</div>`,
	);
}

export function applyResultPage(
	status: string,
	reason?: string,
	ref?: string,
	existingAppliedAt?: string,
	drawDate?: string,
	baseUrl?: string,
	eligibleAfter?: string,
): string {
	let heading: string;
	let message: string;

	if (status === "accepted") {
		heading = "Application Received";
		message =
			"Your application has been added to the lottery pool. You will be contacted if selected.";
	} else if (status === "flagged") {
		heading = "Application Received";
		message =
			"Your application has been received. A volunteer will contact you for additional information.";
	} else if (status === "rejected") {
		if (reason === "window_closed") {
			heading = "Applications Closed";
			message =
				"The application window is currently closed. Please check back later.";
		} else if (reason === "cooldown") {
			heading = "Please Wait";
			const date = eligibleAfter
				? new Date(eligibleAfter).toLocaleDateString("en-GB")
				: null;
			message = date
				? `You can apply again on ${date}.`
				: "You have applied recently. Please wait before submitting a new application.";
		} else if (reason === "duplicate") {
			heading = "Application Already Received";
			if (existingAppliedAt && drawDate) {
				const when = formatAppliedAt(existingAppliedAt);
				message = `Your application was already received at ${when}. We'll let you know whether your name was drawn to receive a grant on or soon after ${drawDate}.`;
			} else {
				message = "You have already applied during this application window.";
			}
		} else {
			heading = "Application Not Accepted";
			message =
				"Your application could not be accepted at this time. Please try again later.";
		}
	} else {
		heading = "Application Status";
		message = "Your application has been processed.";
	}

	return publicLayout(
		heading,
		`<div class="w-full max-w-md">
	<div class="card p-8 text-center">
		<h1 class="font-heading text-2xl font-bold text-bark mb-4">${escapeHtml(heading)}</h1>
		<p class="text-bark-muted font-body">${escapeHtml(message)}</p>
${
	ref
		? (
				() => {
					const statusUrl = baseUrl
						? `${baseUrl}/status?ref=${encodeURIComponent(ref)}`
						: `/status?ref=${encodeURIComponent(ref)}`;
					return `		<div class="mt-6 pt-4 border-t border-bark-muted/20 text-left">
			<p class="text-xs text-bark-muted font-body mb-2">Save the following link to check the status of your application. Please check this page before contacting us with questions about your application.</p>
			<a href="${escapeHtml(statusUrl)}" class="block font-mono text-sm text-bark break-all underline">${escapeHtml(statusUrl)}</a>
		</div>`;
				}
			)()
		: ""
}
	</div>
</div>`,
	);
}
