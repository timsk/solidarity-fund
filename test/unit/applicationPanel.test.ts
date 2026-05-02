import { describe, expect, test } from "bun:test";
import type { ApplicationRow } from "../../src/domain/application/repository.ts";
import {
	reviewPanel,
	viewPanel,
} from "../../src/web/pages/applicationPanel.ts";

const app: ApplicationRow = {
	id: "app-1",
	applicantId: "applicant-07700900001",
	lotteryName: "2026-03",
	status: "accepted",
	rank: null,
	paymentPreference: "cash",
	name: "Alice",
	phone: "07700900001",
	rejectReason: null,
	appliedAt: "2026-03-01T10:00:00Z",
	acceptedAt: "2026-03-01T10:00:00Z",
	selectedAt: null,
	rejectedAt: null,
	email: null,
	meetingPlace: "Mill Road",
	sortCode: null,
	accountNumber: null,
	poaRef: null,
	reviewedByVolunteerId: null,
};

describe("viewPanel", () => {
	test("shows application details", () => {
		const html = viewPanel(app);
		expect(html).toContain("Alice");
		expect(html).toContain("07700900001");
		expect(html).toContain("Cash");
	});

	test("shows reject reason when rejected", () => {
		const rejected = { ...app, status: "rejected", rejectReason: "cooldown" };
		const html = viewPanel(rejected);
		expect(html).toContain("cooldown");
	});

	test("shows rank when selected", () => {
		const selected = { ...app, status: "selected", rank: 3 };
		const html = viewPanel(selected);
		expect(html).toContain("3");
	});

	test("has close button", () => {
		const html = viewPanel(app);
		expect(html).toContain("/applications/close");
	});

	test("shows applicant link when applicantId provided", () => {
		const html = viewPanel(app, "rec-1");
		expect(html).toContain("/applicants/rec-1/edit");
		expect(html).toContain("View Applicant");
	});

	test("omits applicant link when applicantId is null", () => {
		const html = viewPanel(app, null);
		expect(html).not.toContain("View Applicant");
	});

	test("shows meeting place", () => {
		const html = viewPanel(app);
		expect(html).toContain("Mill Road");
	});

	test("shows email when present", () => {
		const html = viewPanel({ ...app, email: "alice@example.com" });
		expect(html).toContain("alice@example.com");
	});

	test("shows bank details when present", () => {
		const withBank = {
			...app,
			sortCode: "12-34-56",
			accountNumber: "12345678",
		};
		const html = viewPanel(withBank);
		expect(html).toContain("12-34-56");
		expect(html).toContain("12345678");
	});

	test("shows accepted/selected/rejected dates when present", () => {
		const full = {
			...app,
			acceptedAt: "2026-03-02T10:00:00Z",
			selectedAt: "2026-03-05T10:00:00Z",
		};
		const html = viewPanel(full);
		expect(html).toContain("Accepted");
		expect(html).toContain("Selected");
	});

	test("shows POA link when poaRef is set", () => {
		const withPoa = { ...app, poaRef: "poa-ref-1" };
		const html = viewPanel(withPoa);
		expect(html).toContain("/applications/app-1/documents/poa");
		expect(html).toContain("View document");
	});

	test("omits POA link when poaRef is null", () => {
		const html = viewPanel(app);
		expect(html).not.toContain("/documents/poa");
	});
});

describe("reviewPanel", () => {
	test("shows confirm and reject buttons for flagged app", () => {
		const flagged = { ...app, status: "flagged" };
		const html = reviewPanel(flagged);
		expect(html).toContain("Confirm");
		expect(html).toContain("Reject");
		expect(html).toContain("@post");
	});

	test("shows application details", () => {
		const flagged = { ...app, status: "flagged" };
		const html = reviewPanel(flagged);
		expect(html).toContain("Alice");
		expect(html).toContain("07700900001");
	});

	test("shows applicant link when applicantId provided", () => {
		const flagged = { ...app, status: "flagged" };
		const html = reviewPanel(flagged, "rec-2");
		expect(html).toContain("/applicants/rec-2/edit");
		expect(html).toContain("View Applicant");
	});
});
