import { layout } from "./layout.ts";

type LotteryStatus =
	| "initial"
	| "open"
	| "windowClosed"
	| "drawn"
	| "cancelled";

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

function defaultClosingValue(): string {
	const now = new Date();
	const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
	const y = lastDay.getFullYear();
	const m = String(lastDay.getMonth() + 1).padStart(2, "0");
	const d = String(lastDay.getDate()).padStart(2, "0");
	return `${y}-${m}-${d}T23:59`;
}

function statusBadge(status: LotteryStatus): string {
	const styles: Record<LotteryStatus, string> = {
		initial: "bg-gray-50 text-gray-600 border-gray-200",
		open: "bg-green-50 text-green-700 border-green-200",
		windowClosed: "bg-amber-50 text-amber-700 border-amber-200",
		drawn: "bg-blue-50 text-blue-700 border-blue-200",
		cancelled: "bg-red-50 text-red-700 border-red-200",
	};
	const labels: Record<LotteryStatus, string> = {
		initial: "No Window",
		open: "Applications Open",
		windowClosed: "Window Closed",
		drawn: "Drawn",
		cancelled: "Cancelled",
	};
	return `<span class="badge ${styles[status]}">${labels[status]}</span>`;
}

function actionSection(month: string, status: LotteryStatus): string {
	switch (status) {
		case "initial":
			return `<p class="text-bark-muted mb-4">No active lottery — start one below.</p>
				<form data-on:submit="@post('/lottery/open')" class="space-y-4 max-w-sm">
					<div>
						<label class="label" for="lotteryName">Lottery name</label>
						<input id="lotteryName" name="lotteryName" type="text" required class="input" placeholder="e.g. May 2026 Fundraiser" data-bind:lotteryname />
					</div>
					<div>
						<label class="label" for="expectedClosing">Expected close date</label>
				<input id="expectedClosing" name="expectedClosing" type="datetime-local" required class="input" value="${defaultClosingValue()}" data-bind:expected-closing />
					<p class="text-xs text-bark-muted mt-1">Applications automatically close when this deadline is reached. You can also close early from this page.</p>
					</div>
					<div id="lottery-error" class="text-red-600 text-sm font-medium" role="alert"></div>
					<button type="submit" class="btn btn-primary">Open Applications</button>
				</form>`;
		case "open":
			return `<p class="text-bark-muted mb-4">Applications open for ${escapeHtml(month)}.</p>
			<div class="flex gap-3" data-signals="{confirmCancel: false}">
				<button class="btn btn-primary" data-show="!$confirmCancel" data-on:click="@post('/lottery/close')">Close Applications</button>
				<button type="button" class="btn btn-secondary" data-show="!$confirmCancel" data-on:click="$confirmCancel = true">Cancel Lottery</button>
				<span data-show="$confirmCancel" class="flex items-center gap-2" style="display:none">
					<span class="text-sm text-red-700 font-semibold">This will delete all applications!</span>
					<button type="button" class="btn btn-danger" data-on:click="@post('/lottery/cancel')">Cancel Lottery</button>
					<button type="button" class="btn btn-secondary" data-on:click="$confirmCancel = false">Keep</button>
				</span>
			</div>`;
		case "windowClosed":
			return `<p class="text-bark-muted mb-4">Window closed for ${escapeHtml(month)}. Ready to draw.</p>
				<form data-on:submit="@post('/lottery/draw')" class="space-y-4 max-w-sm">
					<div>
						<label class="label" for="availableBalance">Available Balance</label>
						<input id="availableBalance" name="availableBalance" type="number" step="0.01" min="0" required class="input" data-bind:availablebalance />
					</div>
					<div>
						<label class="label" for="reserve">Reserve</label>
						<input id="reserve" name="reserve" type="number" step="0.01" min="0" required class="input" data-bind:reserve />
					</div>
					<div>
						<label class="label" for="grantAmount">Grant Amount</label>
						<input id="grantAmount" name="grantAmount" type="number" step="0.01" min="0.01" required class="input" data-bind:grantamount />
					</div>
					<button type="submit" class="btn btn-primary">Run Draw</button>
				</form>`;
		case "drawn":
			return `<p class="text-bark-muted mb-4">Lottery drawn for ${escapeHtml(month)}.</p>
			<a href="/applications?month=${encodeURIComponent(month)}" class="btn btn-primary no-underline">View Results</a>
			<hr class="my-6" />
			<p class="text-bark-muted mb-4">Start a new lottery below.</p>
			<form data-on:submit="@post('/lottery/open')" class="space-y-4 max-w-sm">
				<div>
					<label class="label" for="lotteryName">Lottery name</label>
					<input id="lotteryName" name="lotteryName" type="text" required class="input" placeholder="e.g. May 2026 Fundraiser" data-bind:lotteryname />
				</div>
				<div>
					<label class="label" for="expectedClosing">Expected close date</label>
					<input id="expectedClosing" name="expectedClosing" type="datetime-local" required class="input" value="${defaultClosingValue()}" data-bind:expected-closing />
					<p class="text-xs text-bark-muted mt-1">Applications automatically close when this deadline is reached. You can also close early from this page.</p>
				</div>
				<div id="lottery-error" class="text-red-600 text-sm font-medium" role="alert"></div>
				<button type="submit" class="btn btn-primary">Open Applications</button>
			</form>`;
		case "cancelled":
			return `<p class="text-bark-muted mb-4">Lottery cancelled for ${escapeHtml(month)}.</p>
			<a href="/" class="btn btn-primary no-underline">Back to Dashboard</a>
			<hr class="my-6" />
			<p class="text-bark-muted mb-4">Start a new lottery below.</p>
			<form data-on:submit="@post('/lottery/open')" class="space-y-4 max-w-sm">
				<div>
					<label class="label" for="lotteryName">Lottery name</label>
					<input id="lotteryName" name="lotteryName" type="text" required class="input" placeholder="e.g. May 2026 Fundraiser" data-bind:lotteryname />
				</div>
				<div>
					<label class="label" for="expectedClosing">Expected close date</label>
					<input id="expectedClosing" name="expectedClosing" type="datetime-local" required class="input" value="${defaultClosingValue()}" data-bind:expected-closing />
					<p class="text-xs text-bark-muted mt-1">Applications automatically close when this deadline is reached. You can also close early from this page.</p>
				</div>
				<div id="lottery-error" class="text-red-600 text-sm font-medium" role="alert"></div>
				<button type="submit" class="btn btn-primary">Open Applications</button>
			</form>`;
	}
}

export function lotteryPage(
	lotteryName: string,
	status: LotteryStatus,
): string {
	const body = `<div class="max-w-2xl mx-auto px-4 py-8" data-signals='{"availablebalance": "", "reserve": "", "grantamount": "", "expectedClosing": "", "lotteryname": "", "confirmcancel": false}'>
	<div class="flex items-center justify-between mb-6">
		<div class="flex items-center gap-3">
			<a href="/" class="text-bark-muted hover:text-bark transition-colors text-sm">&larr; Back</a>
			<h1 class="font-heading text-2xl font-semibold text-bark">Lottery</h1>
		</div>
		${statusBadge(status)}
	</div>

	<div id="lottery-content" class="card p-6">
		<h2 class="font-heading font-semibold text-lg mb-4">${escapeHtml(lotteryName)}</h2>
		${actionSection(lotteryName, status)}
	</div>
</div>`;

	return layout("Lottery", body);
}

export function lotteryContent(
	lotteryName: string,
	status: LotteryStatus,
): string {
	return `<div id="lottery-content" class="card p-6">
		<h2 class="font-heading font-semibold text-lg mb-4">${escapeHtml(lotteryName)}</h2>
		${actionSection(lotteryName, status)}
	</div>`;
}
