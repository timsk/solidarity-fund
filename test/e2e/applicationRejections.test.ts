import {
	expect,
	openLotteryWindow,
	submitApplication,
	test,
} from "./fixtures.ts";

test.describe("application rejections & edge cases", () => {
	test("rejects when application window is not open", async ({
		serverInstance,
		login,
		page,
	}) => {
		void serverInstance;
		await login(page);

		// Submit without opening the window
		const { ok, url } = await submitApplication(page, {
			name: "No Window",
			phone: "07700900001",
		});
		expect(ok).toBe(true);
		expect(url).toContain("status=rejected");
		expect(url).toContain("reason=window_closed");
	});

	test("rejects duplicate application by name + email", async ({
		serverInstance,
		login,
		page,
	}) => {
		void serverInstance;
		await login(page);

		await openLotteryWindow(page);

		// First application with email — accepted
		const first = await submitApplication(page, {
			name: "Email Dupe",
			phone: "07700900101",
			email: "dupe@example.com",
		});
		expect(first.url).toContain("status=accepted");

		// Different phone, same name + email → duplicate
		const second = await submitApplication(page, {
			name: "Email Dupe",
			phone: "07700900102",
			email: "dupe@example.com",
		});
		expect(second.url).toContain("status=rejected");
		expect(second.url).toContain("reason=duplicate");

		// Verify the result page shows the timestamp message
		const resultPage = await page.goto(second.url);
		if (resultPage) {
			const text = await resultPage.text();
			expect(text).toContain("Application Already Received");
			expect(text).toContain("already received at");
		}
	});

	test("rejects duplicate application by name + email with case insensitivity", async ({
		serverInstance,
		login,
		page,
	}) => {
		void serverInstance;
		await login(page);

		await openLotteryWindow(page);

		// First application
		const first = await submitApplication(page, {
			name: "Case Test",
			phone: "07700900103",
			email: "MIXED@Example.COM",
		});
		expect(first.url).toContain("status=accepted");

		// Different phone, same name, different email case → duplicate
		const second = await submitApplication(page, {
			name: "Case Test",
			phone: "07700900104",
			email: "mixed@example.com",
		});
		expect(second.url).toContain("status=rejected");
		expect(second.url).toContain("reason=duplicate");
	});

	test("rejects duplicate application in same month", async ({
		serverInstance,
		login,
		page,
	}) => {
		void serverInstance;
		await login(page);

		await openLotteryWindow(page);

		// First application — accepted
		const first = await submitApplication(page, {
			name: "Dupe Tester",
			phone: "07700900002",
		});
		expect(first.url).toContain("status=accepted");

		// Second application same phone + name — duplicate
		const second = await submitApplication(page, {
			name: "Dupe Tester",
			phone: "07700900002",
		});
		expect(second.url).toContain("status=rejected");
		expect(second.url).toContain("reason=duplicate");
	});

	test("accepted applicant is rejected as duplicate while window still open", async ({
		serverInstance,
		login,
		page,
	}) => {
		void serverInstance;
		await login(page);

		await openLotteryWindow(page);

		// Apply once → accepted
		const first = await submitApplication(page, {
			name: "Open Dupe",
			phone: "07700900003",
		});
		expect(first.url).toContain("status=accepted");

		// Apply again with same identity while window still open → duplicate
		// (accepted status is not in the exclusion list)
		const second = await submitApplication(page, {
			name: "Open Dupe",
			phone: "07700900003",
		});
		expect(second.url).toContain("status=rejected");
		expect(second.url).toContain("reason=duplicate");

		await page.goto("/applications");
		const rows = page.locator("tr", { hasText: "Open Dupe" });
		await expect(rows).toHaveCount(1, { timeout: 5000 });
		await expect(rows).toContainText("Accepted", { timeout: 5000 });
	});

	test("flags application when known phone has different name", async ({
		serverInstance,
		login,
		page,
	}) => {
		void serverInstance;
		await login(page);

		await openLotteryWindow(page);

		// First: create a known applicant
		const first = await submitApplication(page, {
			name: "Original Name",
			phone: "07700900004",
		});
		expect(first.url).toContain("status=accepted");

		// Second: same phone, different name → flagged
		const second = await submitApplication(page, {
			name: "Different Name",
			phone: "07700900004",
		});
		expect(second.url).toContain("status=flagged");

		// Verify flagged status in admin applications list
		await page.goto("/applications");
		const flaggedRow = page.locator("tr", { hasText: "Different Name" });
		await expect(flaggedRow).toContainText("Flagged", { timeout: 5000 });
	});

	test("volunteer confirms flagged application → confirmed", async ({
		serverInstance,
		login,
		page,
	}) => {
		void serverInstance;
		await login(page);

		// Create a known applicant via admin CRUD (no application → no duplicate)
		await page.goto("/applicants");
		await page.locator("button", { hasText: "Add Applicant" }).click();
		await page.locator("#panel h2", { hasText: "New Applicant" }).waitFor();
		await page.locator("input[data-bind\\:name]").fill("Known Admin");
		await page.locator("input[data-bind\\:phone]").fill("07700900005");
		await page.locator('button[type="submit"]', { hasText: "Create" }).click();
		await expect(page.locator("#applicant-rows")).toContainText("Known Admin", {
			timeout: 5000,
		});

		await openLotteryWindow(page);

		// Apply with same phone, different name → flagged
		const flagged = await submitApplication(page, {
			name: "Alias Person",
			phone: "07700900005",
		});
		expect(flagged.url).toContain("status=flagged");

		// Navigate to applications and click the flagged row
		await page.goto("/applications");
		const flaggedRow = page.locator("tr", { hasText: "Alias Person" });
		await expect(flaggedRow).toContainText("Flagged", { timeout: 5000 });
		await flaggedRow.click();

		// Panel should show review buttons
		await expect(page.locator("#panel")).toContainText("Alias Person", {
			timeout: 10000,
		});
		await expect(
			page.locator("#panel button", { hasText: "Confirm" }),
		).toBeVisible();

		// Confirm the flagged application
		await page.locator("#panel button", { hasText: "Confirm" }).click();

		// After confirm, review buttons disappear and status shows as Confirmed
		await expect(
			page.locator("#panel button", { hasText: "Confirm" }),
		).not.toBeVisible({ timeout: 10000 });
		await expect(page.locator("#panel")).toContainText("Confirmed", {
			timeout: 5000,
		});
		// Breadcrumb: shows who confirmed + datetime
		await expect(page.locator("#panel")).toContainText("Confirmed by Test on", {
			timeout: 5000,
		});

		// Table row should also reflect Confirmed
		const confirmedRow = page.locator("tr", { hasText: "Alias Person" });
		await expect(confirmedRow).toContainText("Confirmed", { timeout: 5000 });

		// History tab shows the review event
		await page.locator("#panel button.tab", { hasText: "History" }).click();
		await expect(page.locator("#history-content")).toContainText(
			"Confirmed by Test",
			{ timeout: 10000 },
		);
	});

	test("volunteer confirms flagged application when original applicant already applied this month → confirmed", async ({
		serverInstance,
		login,
		page,
	}) => {
		void serverInstance;
		await login(page);

		await openLotteryWindow(page);

		// Original Name applies and is accepted
		const original = await submitApplication(page, {
			name: "Original Person",
			phone: "07700900008",
		});
		expect(original.url).toContain("status=accepted");

		// Same phone, different name → flagged
		const flagged = await submitApplication(page, {
			name: "Different Person",
			phone: "07700900008",
		});
		expect(flagged.url).toContain("status=flagged");

		// Navigate to flagged application
		await page.goto("/applications");
		const flaggedRow = page.locator("tr", { hasText: "Different Person" });
		await expect(flaggedRow).toContainText("Flagged", { timeout: 5000 });
		await flaggedRow.click();

		await expect(
			page.locator("#panel button", { hasText: "Confirm" }),
		).toBeVisible({ timeout: 10000 });

		// Confirming should succeed — the submitted identity has no prior applications
		await page.locator("#panel button", { hasText: "Confirm" }).click();

		await expect(
			page.locator("#panel button", { hasText: "Confirm" }),
		).not.toBeVisible({ timeout: 10000 });
		await expect(page.locator("#panel")).toContainText("Confirmed", {
			timeout: 5000,
		});
		await expect(page.locator("#panel")).toContainText("Confirmed by Test on", {
			timeout: 5000,
		});

		const confirmedRow = page.locator("tr", { hasText: "Different Person" });
		await expect(confirmedRow).toContainText("Confirmed", { timeout: 5000 });

		await page.locator("#panel button.tab", { hasText: "History" }).click();
		await expect(page.locator("#history-content")).toContainText(
			"Confirmed by Test",
			{ timeout: 10000 },
		);
	});
	test("volunteer rejects flagged application → identity_mismatch", async ({
		serverInstance,
		login,
		page,
	}) => {
		void serverInstance;
		await login(page);

		await openLotteryWindow(page);

		// Create known applicant then flag with different name
		await submitApplication(page, {
			name: "Real Person",
			phone: "07700900006",
		});
		const flagged = await submitApplication(page, {
			name: "Fake Person",
			phone: "07700900006",
		});
		expect(flagged.url).toContain("status=flagged");

		// Navigate to applications and click the flagged row
		await page.goto("/applications");
		const flaggedRow = page.locator("tr", { hasText: "Fake Person" });
		await expect(flaggedRow).toContainText("Flagged", { timeout: 5000 });
		await flaggedRow.click();

		await expect(
			page.locator("#panel button", { hasText: "Reject" }),
		).toBeVisible({ timeout: 10000 });

		// Reject the flagged application
		await page.locator("#panel button", { hasText: "Reject" }).click();

		// After reject, status should be rejected with identity_mismatch reason
		await expect(page.locator("#panel")).toContainText("Rejected", {
			timeout: 10000,
		});
		await expect(page.locator("#panel")).toContainText("identity_mismatch", {
			timeout: 5000,
		});
		// Breadcrumb: shows who rejected + datetime
		await expect(page.locator("#panel")).toContainText("Rejected by Test on", {
			timeout: 5000,
		});

		// History tab shows the rejection event
		await page.locator("#panel button.tab", { hasText: "History" }).click();
		await expect(page.locator("#history-content")).toContainText(
			"Rejected by Test",
			{ timeout: 10000 },
		);
	});

	test("bank preference application is accepted", async ({
		serverInstance,
		login,
		page,
	}) => {
		void serverInstance;
		await login(page);

		await openLotteryWindow(page);

		const { ok, url } = await submitApplication(page, {
			name: "Bank Tester",
			phone: "07700900007",
			paymentPreference: "bank",
			sortCode: "12-34-56",
			accountNumber: "12345678",
		});
		expect(ok).toBe(true);
		expect(url).toContain("status=accepted");

		// Verify shows with bank preference in applications list
		await page.goto("/applications");
		const row = page.locator("tr", { hasText: "Bank Tester" });
		await expect(row).toContainText("Accepted", { timeout: 5000 });
		await expect(row).toContainText("Bank", { timeout: 5000 });
	});

	test("form prevents cash submission without meetingPlace", async ({
		serverInstance,
		login,
		page,
	}) => {
		void serverInstance;
		await login(page);

		await openLotteryWindow(page);
		await page.goto("/apply");

		await page.locator("#name").fill("NoPlace Person");
		await page.locator("#phone").fill("07700900009");

		const meetingPlace = page.locator("#meetingPlace");
		await expect(meetingPlace).toHaveAttribute("required", "");

		await page.locator('button[type="submit"]').click();

		await expect(page).toHaveURL("/apply");
		await expect(
			page.locator("text=Apply for a grant of £40"),
		).toBeVisible();
	});

	test("revert confirmed application → flagged, confirm/reject buttons reappear", async ({
		serverInstance,
		login,
		page,
	}) => {
		void serverInstance;
		await login(page);

		// Create a known applicant via admin CRUD
		await page.goto("/applicants");
		await page.locator("button", { hasText: "Add Applicant" }).click();
		await page.locator("#panel h2", { hasText: "New Applicant" }).waitFor();
		await page.locator("input[data-bind\\:name]").fill("Revertable Admin");
		await page.locator("input[data-bind\\:phone]").fill("07700900010");
		await page.locator('button[type="submit"]', { hasText: "Create" }).click();
		await expect(page.locator("#applicant-rows")).toContainText(
			"Revertable Admin",
			{ timeout: 5000 },
		);

		await openLotteryWindow(page);

		// Apply with same phone, different name → flagged
		const flagged = await submitApplication(page, {
			name: "Revert Me",
			phone: "07700900010",
		});
		expect(flagged.url).toContain("status=flagged");

		// Navigate to applications, open flagged row, and confirm
		await page.goto("/applications");
		const flaggedRow = page.locator("tr", { hasText: "Revert Me" });
		await expect(flaggedRow).toContainText("Flagged", { timeout: 5000 });
		await flaggedRow.click();

		await expect(
			page.locator("#panel button", { hasText: "Confirm" }),
		).toBeVisible({ timeout: 10000 });
		await page.locator("#panel button", { hasText: "Confirm" }).click();

		// After confirm: status is Confirmed, no Confirm/Reject buttons
		await expect(
			page.locator("#panel button", { hasText: "Confirm" }),
		).not.toBeVisible({ timeout: 10000 });
		await expect(page.locator("#panel")).toContainText("Confirmed", {
			timeout: 5000,
		});

		// Revert button should be visible in the amber warning block
		await expect(
			page.locator("#panel button", { hasText: "Revert Decision" }),
		).toBeVisible({ timeout: 5000 });
		await expect(page.locator("#panel")).toContainText(
			"This application has been confirmed",
			{ timeout: 5000 },
		);

		// Click revert
		await page.locator("#panel button", { hasText: "Revert Decision" }).click();

		// After revert: Confirm/Reject buttons reappear, table row shows Flagged
		await expect(
			page.locator("#panel button", { hasText: "Confirm" }),
		).toBeVisible({ timeout: 10000 });
		await expect(
			page.locator("#panel button", { hasText: "Reject" }),
		).toBeVisible({ timeout: 5000 });
		const revertedRow = page.locator("tr", { hasText: "Revert Me" });
		await expect(revertedRow).toContainText("Flagged", { timeout: 5000 });

		// No amber revert block visible
		await expect(
			page.locator("#panel button", { hasText: "Revert Decision" }),
		).not.toBeVisible({ timeout: 5000 });
	});

	test("revert rejected application → flagged, confirm/reject buttons reappear", async ({
		serverInstance,
		login,
		page,
	}) => {
		void serverInstance;
		await login(page);

		// Create a known applicant via admin CRUD
		await page.goto("/applicants");
		await page.locator("button", { hasText: "Add Applicant" }).click();
		await page.locator("#panel h2", { hasText: "New Applicant" }).waitFor();
		await page.locator("input[data-bind\\:name]").fill("Reject Admin");
		await page.locator("input[data-bind\\:phone]").fill("07700900011");
		await page.locator('button[type="submit"]', { hasText: "Create" }).click();
		await expect(page.locator("#applicant-rows")).toContainText(
			"Reject Admin",
			{ timeout: 5000 },
		);

		await openLotteryWindow(page);

		// Apply with same phone, different name → flagged
		const flagged = await submitApplication(page, {
			name: "Reject Me",
			phone: "07700900011",
		});
		expect(flagged.url).toContain("status=flagged");

		// Navigate to applications, open flagged row, and reject
		await page.goto("/applications");
		const flaggedRow = page.locator("tr", { hasText: "Reject Me" });
		await expect(flaggedRow).toContainText("Flagged", { timeout: 5000 });
		await flaggedRow.click();

		await expect(
			page.locator("#panel button", { hasText: "Reject" }),
		).toBeVisible({ timeout: 10000 });
		await page.locator("#panel button", { hasText: "Reject" }).click();

		// After reject: status is Rejected, no Confirm/Reject buttons
		await expect(page.locator("#panel")).toContainText("Rejected", {
			timeout: 10000,
		});

		// Revert button should be visible
		await expect(
			page.locator("#panel button", { hasText: "Revert Decision" }),
		).toBeVisible({ timeout: 5000 });
		await expect(page.locator("#panel")).toContainText(
			"This application has been rejected",
			{ timeout: 5000 },
		);

		// Click revert
		await page.locator("#panel button", { hasText: "Revert Decision" }).click();

		// After revert: Confirm/Reject buttons reappear, table row shows Flagged
		await expect(
			page.locator("#panel button", { hasText: "Confirm" }),
		).toBeVisible({ timeout: 10000 });
		await expect(
			page.locator("#panel button", { hasText: "Reject" }),
		).toBeVisible({ timeout: 5000 });
		const revertedRow = page.locator("tr", { hasText: "Reject Me" });
		await expect(revertedRow).toContainText("Flagged", { timeout: 5000 });
	});
});
