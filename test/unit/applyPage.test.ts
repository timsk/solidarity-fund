import { describe, expect, test } from "bun:test";
import {
	applyClosedPage,
	applyPage,
	applyResultPage,
} from "../../src/web/pages/apply.ts";

describe("applyPage", () => {
	test("renders form with required fields", () => {
		const html = applyPage("2026-12-31T23:59:59.000Z");
		expect(html).toContain('name="name"');
		expect(html).toContain('name="phone"');
		expect(html).toContain('name="email"');
		expect(html).toContain('name="meetingPlace"');
		expect(html).toContain('name="paymentPreference"');
		expect(html).toContain('action="/apply"');
		expect(html).toContain('method="POST"');
	});

	test("form uses multipart/form-data encoding", () => {
		const html = applyPage("2026-12-31T23:59:59.000Z");
		expect(html).toContain('enctype="multipart/form-data"');
	});

	test("bank fields include optional POA file input with helper text", () => {
		const html = applyPage("2026-12-31T23:59:59.000Z");
		expect(html).toContain('name="poa"');
		expect(html).toContain('type="file"');
		expect(html).toContain('accept="image/*,.pdf"');
		expect(html).toContain("Optional — but attaching now speeds things up");
	});

	test("includes Datastar for payment preference toggle", () => {
		const html = applyPage("2026-12-31T23:59:59.000Z");
		expect(html).toContain("datastar");
	});

	test("includes altcha widget", () => {
		const html = applyPage("2026-12-31T23:59:59.000Z");
		expect(html).toContain("altcha-widget");
		expect(html).toContain("/api/altcha/challenge");
	});

	test("includes data retention notice", () => {
		const html = applyPage("2026-12-31T23:59:59.000Z");
		expect(html).toContain("6 months");
		expect(html).toContain("/privacy");
	});
});

describe("applyClosedPage", () => {
	test("shows window closed message", () => {
		const html = applyClosedPage();
		expect(html).toContain("closed");
	});
});

describe("applyResultPage", () => {
	test("accepted status shows lottery pool message", () => {
		const html = applyResultPage("accepted");
		expect(html).toContain("lottery pool");
	});

	test("flagged status shows volunteer contact message", () => {
		const html = applyResultPage("flagged");
		expect(html).toContain("volunteer will contact");
	});

	test("rejected with window_closed reason", () => {
		const html = applyResultPage("rejected", "window_closed");
		expect(html).toContain("closed");
	});

	test("rejected with cooldown reason", () => {
		const html = applyResultPage("rejected", "cooldown");
		expect(html).toContain("recently");
	});

	test("rejected with duplicate reason shows timestamp when dates provided", () => {
		const html = applyResultPage(
			"rejected",
			"duplicate",
			undefined,
			"2026-01-15T14:27:00.000Z",
			"31/01/2026",
		);
		expect(html).toContain("Application Already Received");
		expect(html).toContain("already received at 14:27 on 15/01/2026");
		expect(html).toContain("on or soon after 31/01/2026");
	});

	test("rejected with duplicate reason falls back without timestamps", () => {
		const html = applyResultPage("rejected", "duplicate");
		expect(html).toContain("already applied during this application window");
	});

	test("rejected with duplicate reason", () => {
		const html = applyResultPage("rejected", "duplicate");
		expect(html).toContain("already applied");
	});
});

describe("applyResultPage — reference number", () => {
	test("shows reference number when provided", () => {
		const html = applyResultPage("accepted", undefined, "abc-123");
		expect(html).toContain("abc-123");
		expect(html).toContain("check the status of your application");
		expect(html).toContain("/status?ref=abc-123");
	});

	test("omits reference number block when not provided", () => {
		const html = applyResultPage("accepted");
		expect(html).not.toContain("Save the following link");
	});
});
