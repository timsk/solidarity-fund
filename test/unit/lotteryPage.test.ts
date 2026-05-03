import { describe, expect, test } from "bun:test";
import { lotteryPage } from "../../src/web/pages/lottery.ts";

describe("lotteryPage", () => {
	test("initial state shows Open button", () => {
		const html = lotteryPage("2026-03", "initial");
		expect(html).toContain("Open Applications");
		expect(html).toContain("No active lottery");
	});

	test("initial state shows lottery name input", () => {
		const html = lotteryPage("test-lottery", "initial");
		expect(html).toContain('id="lotteryName"');
		expect(html).toContain("lotteryname");
	});

	test("initial state copy mentions 'start one'", () => {
		const html = lotteryPage("2026-03", "initial");
		expect(html).toContain("No active lottery");
	});

	test("open state shows Close button", () => {
		const html = lotteryPage("2026-03", "open");
		expect(html).toContain("Close Applications");
		expect(html).toContain("Applications open");
	});

	test("windowClosed state shows draw form", () => {
		const html = lotteryPage("2026-03", "windowClosed");
		expect(html).toContain("Run Draw");
		expect(html).toContain("availableBalance");
		expect(html).toContain("reserve");
		expect(html).toContain("grantAmount");
	});

	test("drawn state shows link to applications", () => {
		const html = lotteryPage("2026-03", "drawn");
		expect(html).toContain("/applications?lottery=2026-03");
		expect(html).toContain("Lottery drawn");
	});

	test("cancelled state shows cancelled message", () => {
		const html = lotteryPage("2026-03", "cancelled");
		expect(html.toLowerCase()).toContain("cancelled");
		expect(html).toContain("Back to Dashboard");
	});

	test("open state shows Cancel Lottery button", () => {
		const html = lotteryPage("2026-03", "open");
		expect(html).toContain("Cancel Lottery");
	});

	test("open state shows confirmation signal", () => {
		const html = lotteryPage("2026-03", "open");
		expect(html.toLowerCase()).toContain("confirmcancel");
	});

	test("open state shows Close Applications button", () => {
		const html = lotteryPage("2026-03", "open");
		expect(html).toContain("Close Applications");
	});

	test("drawn state shows new lottery form", () => {
		const html = lotteryPage("2026-03", "drawn");
		expect(html).toContain("data-on:submit=\"@post('/lottery/open')\"");
		expect(html).toContain('id="lotteryName"');
		expect(html).toContain('id="expectedClosing"');
		expect(html).toContain("Open Applications");
	});

	test("cancelled state shows new lottery form", () => {
		const html = lotteryPage("2026-03", "cancelled");
		expect(html).toContain("data-on:submit=\"@post('/lottery/open')\"");
		expect(html).toContain('id="lotteryName"');
		expect(html).toContain('id="expectedClosing"');
		expect(html).toContain("Open Applications");
	});
});
