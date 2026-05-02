import {
	closeLotteryWindow,
	expect,
	openLotteryWindow,
	runLotteryDraw,
	submitApplication,
	test,
} from "./fixtures.ts";

test.describe("start new lottery after draw", () => {
	test("drawn lottery page allows starting a new lottery", async ({
		serverInstance,
		login,
		page,
	}) => {
		void serverInstance;
		await login(page);

		// Open first lottery and run through a full draw cycle
		await openLotteryWindow(page);
		const { url } = await submitApplication(page, {
			name: "Alice AfterDraw",
			phone: "07700900300",
		});
		expect(url).toContain("status=accepted");

		await closeLotteryWindow(page);
		await runLotteryDraw(page, { balance: 500 });

		// Go back to lottery page — should show drawn state with new lottery form
		await page.goto("/lottery");
		await expect(page.locator("text=Lottery drawn for E2E Test.")).toBeVisible({
			timeout: 10000,
		});
		await expect(page.locator("text=Start a new lottery below")).toBeVisible();
		await expect(page.locator("#lotteryName")).toBeVisible();
		await expect(page.locator("#expectedClosing")).toBeVisible();

		// Start the new lottery via direct POST (matching openLotteryWindow pattern)
		const closeDate = new Date(Date.now() + 30 * 86400000);
		const yyyy = closeDate.getFullYear();
		const mm = String(closeDate.getMonth() + 1).padStart(2, "0");
		const dd = String(closeDate.getDate()).padStart(2, "0");
		const hh = String(closeDate.getHours()).padStart(2, "0");
		const min = String(closeDate.getMinutes()).padStart(2, "0");
		const closingAt = `${yyyy}-${mm}-${dd}T${hh}:${min}`;
		await page.request.post("/lottery/open", {
			data: {
				lotteryname: "E2E Test Round 2",
				expectedClosing: closingAt,
			},
		});

		// Hard navigate to confirm the new lottery is the active one
		await page.goto("/lottery");
		await expect(
			page.locator("text=Applications open for E2E Test Round 2"),
		).toBeVisible({ timeout: 10000 });
		await expect(
			page.locator("button", { hasText: "Close Applications" }),
		).toBeVisible();
	});
});
