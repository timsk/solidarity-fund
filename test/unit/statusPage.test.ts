import { describe, expect, test } from "bun:test";
import type { ApplicationRow } from "../../src/domain/application/repository.ts";
import type { GrantRow } from "../../src/domain/grant/repository.ts";
import {
	statusLookupPage,
	statusTimelinePage,
} from "../../src/web/pages/status.ts";

function makeApp(overrides: Partial<ApplicationRow> = {}): ApplicationRow {
	return {
		ref: 1,
		id: "app-uuid-1",
		applicantId: "applicant-07700900001",
		lotteryName: "2026-03",
		status: "accepted",
		rank: null,
		paymentPreference: "cash",
		name: "Alice",
		phone: "07700900001",
		rejectReason: null,
		appliedAt: "2026-03-01T10:00:00Z",
		acceptedAt: "2026-03-01T10:01:00Z",
		selectedAt: null,
		rejectedAt: null,
		...overrides,
	};
}

function makeGrant(overrides: Partial<GrantRow> = {}): GrantRow {
	return {
		id: "grant-1",
		applicationId: "app-uuid-1",
		applicantId: "applicant-07700900001",
		lotteryName: "2026-03",
		rank: 1,
		status: "awaiting_bank_details",
		paymentPreference: "bank",
		volunteerId: null,
		volunteerName: null,
		applicantName: "Alice",
		applicantPhone: "07700900001",
		poaAttempts: 0,
		amount: null,
		paymentMethod: null,
		paidBy: null,
		paidAt: null,
		expenseReference: null,
		reimbursedAt: null,
		releasedReason: null,
		releasedAt: null,
		createdAt: "2026-03-10T12:00:00Z",
		updatedAt: "2026-03-10T12:00:00Z",
		...overrides,
	};
}

describe("statusLookupPage", () => {
	test("renders lookup form", () => {
		const html = statusLookupPage();
		expect(html).toContain('action="/status"');
		expect(html).toContain('name="ref"');
		expect(html).toContain("Check status");
		expect(html).toContain("Your reference number");
	});

	test("renders error message when provided", () => {
		const html = statusLookupPage("We couldn't find an application");
		expect(html).toContain("We couldn't find an application");
	});

	test("no error shown when not provided", () => {
		const html = statusLookupPage();
		expect(html).not.toContain("couldn't find");
	});
});

describe("statusTimelinePage — pre-lottery", () => {
	test("accepted: shows lottery draw pending", () => {
		const html = statusTimelinePage(makeApp({ status: "accepted" }), null);
		expect(html).toContain("Lottery draw");
		expect(html).toContain("pool");
	});

	test("applied: shows lottery draw pending (same as accepted)", () => {
		const html = statusTimelinePage(makeApp({ status: "applied" }), null);
		expect(html).toContain("Lottery draw");
	});

	test("flagged: shows identity check step", () => {
		const html = statusTimelinePage(makeApp({ status: "flagged" }), null);
		expect(html).toContain("Identity check");
		expect(html).toContain("volunteer");
	});

	test("rejected window_closed: shows reason message", () => {
		const html = statusTimelinePage(
			makeApp({ status: "rejected", rejectReason: "window_closed" }),
			null,
		);
		expect(html).toContain("closed");
	});

	test("rejected cooldown: shows reason message", () => {
		const html = statusTimelinePage(
			makeApp({ status: "rejected", rejectReason: "cooldown" }),
			null,
		);
		expect(html).toContain("recently");
	});

	test("rejected duplicate: shows reason message", () => {
		const html = statusTimelinePage(
			makeApp({ status: "rejected", rejectReason: "duplicate" }),
			null,
		);
		expect(html).toContain("already been submitted");
	});

	test("rejected unknown reason: shows generic message", () => {
		const html = statusTimelinePage(
			makeApp({ status: "rejected", rejectReason: "identity_mismatch" }),
			null,
		);
		expect(html).toContain("not accepted");
	});
});

describe("statusTimelinePage — post-lottery", () => {
	test("not_selected: shows lottery drawn and not selected", () => {
		const html = statusTimelinePage(makeApp({ status: "not_selected" }), null);
		expect(html).toContain("Not selected");
		expect(html).toContain("next month");
	});
});

describe("statusTimelinePage — grant states", () => {
	test("selected + awaiting_bank_details no volunteer: shows volunteer being assigned", () => {
		const html = statusTimelinePage(
			makeApp({ status: "selected" }),
			makeGrant({ status: "awaiting_bank_details", volunteerId: null }),
		);
		expect(html).toContain("Volunteer being assigned");
	});

	test("selected + awaiting_bank_details with volunteer: shows payment details needed", () => {
		const html = statusTimelinePage(
			makeApp({ status: "selected" }),
			makeGrant({ status: "awaiting_bank_details", volunteerId: "vol-1" }),
		);
		expect(html).toContain("Payment details needed");
		expect(html).toContain("Volunteer assigned");
	});

	test("selected + bank_details_submitted: shows POA being reviewed", () => {
		const html = statusTimelinePage(
			makeApp({ status: "selected" }),
			makeGrant({ status: "bank_details_submitted", volunteerId: "vol-1" }),
		);
		expect(html).toContain("Proof of address being reviewed");
	});

	test("selected + poa_approved: shows payment being processed", () => {
		const html = statusTimelinePage(
			makeApp({ status: "selected" }),
			makeGrant({ status: "poa_approved", volunteerId: "vol-1" }),
		);
		expect(html).toContain("Payment being processed");
		expect(html).toContain("Proof of address approved");
	});

	test("selected + offered_cash_alternative: shows cash alternative step", () => {
		const html = statusTimelinePage(
			makeApp({ status: "selected" }),
			makeGrant({ status: "offered_cash_alternative", volunteerId: "vol-1" }),
		);
		expect(html).toContain("Cash alternative");
	});

	test("selected + awaiting_cash_handover: shows cash handover pending", () => {
		const html = statusTimelinePage(
			makeApp({ status: "selected" }),
			makeGrant({ status: "awaiting_cash_handover", volunteerId: "vol-1" }),
		);
		expect(html).toContain("Cash handover pending");
	});

	test("selected + awaiting_cash_handover no volunteer: shows volunteer being assigned", () => {
		const html = statusTimelinePage(
			makeApp({ status: "selected" }),
			makeGrant({ status: "awaiting_cash_handover", volunteerId: null }),
		);
		expect(html).toContain("Volunteer being assigned");
		expect(html).not.toContain("Volunteer assigned");
	});

	test("selected + paid (bank): shows payment received", () => {
		const html = statusTimelinePage(
			makeApp({ status: "selected" }),
			makeGrant({
				status: "paid",
				paymentMethod: "bank",
				volunteerId: "vol-1",
			}),
		);
		expect(html).toContain("Payment received");
	});

	test("selected + awaiting_reimbursement: shows payment received (cash complete)", () => {
		const html = statusTimelinePage(
			makeApp({ status: "selected" }),
			makeGrant({ status: "awaiting_reimbursement", volunteerId: "vol-1" }),
		);
		expect(html).toContain("Payment received");
		expect(html).toContain("Cash handover complete");
	});

	test("selected + reimbursed: shows payment received", () => {
		const html = statusTimelinePage(
			makeApp({ status: "selected" }),
			makeGrant({ status: "reimbursed", volunteerId: "vol-1" }),
		);
		expect(html).toContain("Payment received");
	});

	test("selected + released with volunteer: shows slot released", () => {
		const html = statusTimelinePage(
			makeApp({ status: "selected" }),
			makeGrant({ status: "released", volunteerId: "vol-1" }),
		);
		expect(html).toContain("Slot released");
		expect(html).toContain("next month");
		expect(html).toContain("Volunteer assigned");
	});

	test("selected + released without volunteer: shows slot released (no volunteer step)", () => {
		const html = statusTimelinePage(
			makeApp({ status: "selected" }),
			makeGrant({ status: "released", volunteerId: null }),
		);
		expect(html).toContain("Slot released");
		expect(html).not.toContain("Volunteer assigned");
	});

	test("selected + null grant (no grant yet): shows volunteer being assigned", () => {
		const html = statusTimelinePage(makeApp({ status: "selected" }), null);
		expect(html).toContain("Volunteer being assigned");
	});
});
