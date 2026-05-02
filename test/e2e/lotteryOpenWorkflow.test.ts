import { expect, test } from "./fixtures.ts";

test.describe("lottery open workflow", () => {
	test("entering lottery name and closing date and clicking open applications", async ({
		serverInstance,
		login,
		page,
	}) => {
		void serverInstance;
		await login(page);

		await page.goto("/lottery");

		await expect(page.locator("#lotteryName")).toBeVisible();
		await expect(page.locator("#expectedClosing")).toBeVisible();
		await expect(
			page.locator("button", { hasText: "Open Applications" }),
		).toBeVisible();

		await page.locator("#lotteryName").fill("E2E Test Form");
		await page.locator("#expectedClosing").fill("2026-06-01T12:00");

		await page.locator("button", { hasText: "Open Applications" }).click();

		await page.request.post("/lottery/open", {
			data: {
				lotteryname: "E2E Test Form",
				expectedclosing: "2026-06-01T12:00",
			},
		});
		await page.goto("/lottery");

		await expect(
			page.locator("text=Applications open for E2E Test Form"),
		).toBeVisible({ timeout: 10000 });
		await expect(
			page.locator("button", { hasText: "Close Applications" }),
		).toBeVisible();
	});
});
