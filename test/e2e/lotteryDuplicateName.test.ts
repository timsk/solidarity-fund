import {
	closeLotteryWindow,
	expect,
	openLotteryWindow,
	runLotteryDraw,
	test,
} from "./fixtures.ts";

test.describe("lottery duplicate name", () => {
	test("creating a lottery with a duplicate name shows an error", async ({
		serverInstance,
		login,
		page,
	}) => {
		void serverInstance;
		await login(page);

		await openLotteryWindow(page);
		await closeLotteryWindow(page);
		await runLotteryDraw(page, { balance: 1000 });

		await page.goto("/lottery");

		await page.locator("#lotteryName").fill("E2E Test");
		await page.locator("#expectedClosing").fill("2026-07-01T12:00");

		await page.locator("button", { hasText: "Open Applications" }).click();

		const errorLocator = page.locator("#lottery-error");
		await expect(errorLocator).toBeVisible({ timeout: 10000 });
		await expect(errorLocator).toContainText("already exists");
	});
});
