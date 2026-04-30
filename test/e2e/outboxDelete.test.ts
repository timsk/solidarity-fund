import {
	expect,
	openLotteryWindow,
	submitApplication,
	test,
} from "./fixtures.ts";

test.describe("outbox delete", () => {
	test.beforeEach(async ({ serverInstance, login, page }) => {
		void serverInstance;
		await login(page);

		await openLotteryWindow(page);

		for (const [name, phone] of [
			["Alice Seed", "07700900101"],
			["Bob Seed", "07700900102"],
			["Carol Seed", "07700900103"],
			["Dave Seed", "07700900104"],
		] as const) {
			const { ok, url } = await submitApplication(page, {
				name,
				phone,
				paymentPreference: "cash",
			});
			expect(ok).toBe(true);
			expect(url).toContain("status=accepted");
		}

		await page.waitForTimeout(1000);
		await page.goto("/outbox");
		await expect(page.locator("tr", { hasText: "Alice Seed" })).toBeVisible({
			timeout: 15000,
		});
	});

	test("displays seeded outbox messages", async ({ page }) => {
		await expect(page.locator("tr", { hasText: "Alice Seed" })).toBeVisible({
			timeout: 10000,
		});
		await expect(page.locator("tr", { hasText: "Bob Seed" })).toBeVisible();
		await expect(page.locator("tr", { hasText: "Carol Seed" })).toBeVisible();
		await expect(page.locator("tr", { hasText: "Dave Seed" })).toBeVisible();
	});

	test("deletes a single message via row × button", async ({ page }) => {
		const aliceRow = page.locator("tr", { hasText: "Alice Seed" });
		await expect(aliceRow).toBeVisible({ timeout: 10000 });

		await aliceRow.locator("button[title='Delete this message']").click();

		await page.waitForURL("**/outbox**", { timeout: 10000 });

		await expect(page.locator("tr", { hasText: "Alice Seed" })).not.toBeVisible(
			{
				timeout: 5000,
			},
		);
		await expect(page.locator("tr", { hasText: "Bob Seed" })).toBeVisible();
		await expect(page.locator("tr", { hasText: "Carol Seed" })).toBeVisible();
		await expect(page.locator("tr", { hasText: "Dave Seed" })).toBeVisible();
	});

	test("deletes multiple messages via bulk checkboxes", async ({ page }) => {
		await expect(page.locator("tr", { hasText: "Alice Seed" })).toBeVisible({
			timeout: 10000,
		});

		await page
			.locator("tr", { hasText: "Alice Seed" })
			.locator("input[name=ids]")
			.check();
		await page
			.locator("tr", { hasText: "Bob Seed" })
			.locator("input[name=ids]")
			.check();

		await page
			.locator("button", { hasText: "Delete Selected" })
			.first()
			.click();

		await page.waitForURL("**/outbox**", { timeout: 10000 });

		await expect(page.locator("tr", { hasText: "Alice Seed" })).not.toBeVisible(
			{
				timeout: 5000,
			},
		);
		await expect(page.locator("tr", { hasText: "Bob Seed" })).not.toBeVisible({
			timeout: 5000,
		});
		await expect(page.locator("tr", { hasText: "Carol Seed" })).toBeVisible();
		await expect(page.locator("tr", { hasText: "Dave Seed" })).toBeVisible();
	});

	test("select-all checkbox checks all rows", async ({ page }) => {
		await expect(page.locator("tr", { hasText: "Alice Seed" })).toBeVisible({
			timeout: 10000,
		});

		await page.locator("#select-all").check();

		for (const name of ["Alice Seed", "Bob Seed", "Carol Seed", "Dave Seed"]) {
			await expect(
				page.locator("tr", { hasText: name }).locator("input[name=ids]"),
			).toBeChecked();
		}

		await page
			.locator("button", { hasText: "Delete Selected" })
			.first()
			.click();
		await page.waitForURL("**/outbox**", { timeout: 10000 });

		for (const name of ["Alice Seed", "Bob Seed", "Carol Seed", "Dave Seed"]) {
			await expect(page.locator("tr", { hasText: name })).not.toBeVisible({
				timeout: 5000,
			});
		}

		await expect(page.locator("text=No messages yet.")).toBeVisible();
	});

	test("delete preserves status filter", async ({ page }) => {
		await expect(page.locator("tr", { hasText: "Alice Seed" })).toBeVisible({
			timeout: 10000,
		});

		await page.locator("a", { hasText: "Pending" }).click();
		await page.waitForURL("**/outbox?status=pending**", { timeout: 5000 });

		await expect(page.locator("tr", { hasText: "Alice Seed" })).toBeVisible();
		await expect(page.locator("tr", { hasText: "Bob Seed" })).toBeVisible();

		await page
			.locator("tr", { hasText: "Alice Seed" })
			.locator("button[title='Delete this message']")
			.click();

		await page.waitForURL("**/outbox?status=pending**", { timeout: 10000 });

		await expect(
			page.locator("tr", { hasText: "Alice Seed" }),
		).not.toBeVisible();
		await expect(page.locator("tr", { hasText: "Bob Seed" })).toBeVisible();
	});

	test("delete preserves pagination", async ({ page }) => {
		await expect(page.locator("tr", { hasText: "Alice Seed" })).toBeVisible({
			timeout: 10000,
		});

		await page.goto("/outbox?page=1");
		await expect(page.locator("tr", { hasText: "Alice Seed" })).toBeVisible();

		await page
			.locator("tr", { hasText: "Alice Seed" })
			.locator("button[title='Delete this message']")
			.click();

		await page.waitForURL("**/outbox?page=1**", { timeout: 10000 });
	});

	test("delete with no checkboxes selected is a no-op", async ({ page }) => {
		await expect(page.locator("tr", { hasText: "Alice Seed" })).toBeVisible({
			timeout: 10000,
		});

		await page
			.locator("button", { hasText: "Delete Selected" })
			.first()
			.click();

		await page.waitForURL("**/outbox**", { timeout: 10000 });

		for (const name of ["Alice Seed", "Bob Seed", "Carol Seed", "Dave Seed"]) {
			await expect(page.locator("tr", { hasText: name })).toBeVisible();
		}
	});
});
