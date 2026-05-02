import { type ChildProcess, spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test as base, expect, type Page } from "@playwright/test";
import { solveChallenge } from "altcha-lib/v1";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = "http://localhost:3001";

type Fixtures = {
	serverInstance: undefined;
	login: (page: Page) => Promise<void>;
};

export const test = base.extend<Fixtures>({
	serverInstance: [
		// biome-ignore lint/correctness/noEmptyPattern: Playwright fixture API requires destructured object
		async ({}, use) => {
			const serverPath = path.resolve(__dirname, "testServer.ts");
			const proc: ChildProcess = spawn("bun", ["run", serverPath], {
				stdio: ["pipe", "pipe", "pipe"],
				env: { ...process.env, TEST_PORT: "3001" },
			});

			await new Promise<void>((resolve, reject) => {
				const timeout = setTimeout(
					() => reject(new Error("Server start timeout")),
					15000,
				);
				proc.stdout?.on("data", (data: Buffer) => {
					if (data.toString().includes("TEST_SERVER_READY")) {
						clearTimeout(timeout);
						resolve();
					}
				});
				proc.stderr?.on("data", (data: Buffer) => {
					const msg = data.toString();
					if (msg.includes("error") || msg.includes("Error")) {
						clearTimeout(timeout);
						reject(new Error(`Server error: ${msg}`));
					}
				});
				proc.on("error", (err) => {
					clearTimeout(timeout);
					reject(err);
				});
			});

			await use();

			proc.kill("SIGTERM");
			// Wait for process to exit to free port
			await new Promise<void>((resolve) => {
				proc.on("exit", resolve);
				setTimeout(resolve, 2000);
			});
		},
		{ scope: "test" },
	],

	// biome-ignore lint/correctness/noEmptyPattern: Playwright fixture API requires destructured object
	login: async ({}, use) => {
		await use(async (page: Page) => {
			await page.goto("/login");
			await page.locator("#name").fill("Test");
			await page.locator("#password").fill("test");
			await page.locator('button[type="submit"]').click();
			await page.waitForURL("/");
		});
	},
});

export { expect };

/** Fetch challenge from test server, solve it, return base64 payload for the form */
export async function solveAltcha(): Promise<string> {
	const res = await fetch(`${BASE_URL}/api/altcha/challenge`);
	const challenge = await res.json();
	const { promise } = solveChallenge(
		challenge.challenge,
		challenge.salt,
		challenge.algorithm,
		challenge.maxnumber,
	);
	const solution = await promise;
	if (!solution) throw new Error("Failed to solve altcha challenge");
	const payload = {
		algorithm: challenge.algorithm,
		challenge: challenge.challenge,
		number: solution.number,
		salt: challenge.salt,
		signature: challenge.signature,
	};
	return btoa(JSON.stringify(payload));
}

/** Submit a public application via POST /apply */
export async function submitApplication(
	page: Page,
	opts: {
		name: string;
		phone: string;
		email?: string;
		paymentPreference?: "cash" | "bank";
		meetingPlace?: string;
		sortCode?: string;
		accountNumber?: string;
		poa?: Buffer;
	},
): Promise<{ ok: boolean; url: string }> {
	const altcha = await solveAltcha();
	const multipart: Record<
		string,
		string | { name: string; mimeType: string; buffer: Buffer }
	> = {
		name: opts.name,
		phone: opts.phone,
		meetingPlace: opts.meetingPlace ?? "Town Hall",
		paymentPreference: opts.paymentPreference ?? "cash",
		altcha,
	};
	if (opts.email) multipart.email = opts.email;
	if (opts.sortCode) multipart.sortCode = opts.sortCode;
	if (opts.accountNumber) multipart.accountNumber = opts.accountNumber;
	if (opts.poa)
		multipart.poa = {
			name: "poa.png",
			mimeType: "image/png",
			buffer: opts.poa,
		};
	const res = await page.request.post("/apply", { multipart });
	return { ok: res.ok(), url: res.url() };
}

/** Assign the "Test" volunteer to the currently open grant panel */
export async function assignVolunteer(page: Page): Promise<void> {
	const select = page.locator("select[data-bind\\:assignvolunteerid]");
	await expect(select).toBeVisible({ timeout: 5000 });
	await select.selectOption({ label: "Test" });
	await page.locator("#panel button", { hasText: "Assign" }).click();
	await expect(page.locator("#panel")).toContainText("Test", {
		timeout: 10000,
	});
}

/** Open lottery window, optionally close it, optionally run draw */
export async function openLotteryWindow(page: Page): Promise<void> {
	await page.goto("/lottery");
	const closeDate = new Date(Date.now() + 30 * 86400000);
	const yyyy = closeDate.getFullYear();
	const mm = String(closeDate.getMonth() + 1).padStart(2, "0");
	const dd = String(closeDate.getDate()).padStart(2, "0");
	const hh = String(closeDate.getHours()).padStart(2, "0");
	const min = String(closeDate.getMinutes()).padStart(2, "0");
	const closingAt = `${yyyy}-${mm}-${dd}T${hh}:${min}`;
	await page.request.post("/lottery/open", {
		data: { lotteryname: "E2E Test", expectedClosing: closingAt },
	});
	await page.goto("/lottery");
	await page.locator("text=Close Applications").waitFor({ timeout: 10000 });
}

export async function closeLotteryWindow(page: Page): Promise<void> {
	await page.goto("/lottery");
	await page.locator("button", { hasText: "Close Applications" }).click();
	await page.locator("text=Run Draw").waitFor({ timeout: 10000 });
}

export async function runLotteryDraw(
	page: Page,
	opts: { balance: number; reserve?: number; grantAmount?: number },
): Promise<void> {
	const balanceInput = page.locator("input[data-bind\\:availablebalance]");
	const reserveInput = page.locator("input[data-bind\\:reserve]");
	const grantInput = page.locator("input[data-bind\\:grantamount]");
	await balanceInput.fill(String(opts.balance));
	await reserveInput.fill(String(opts.reserve ?? 0));
	await grantInput.fill(String(opts.grantAmount ?? 40));
	await page.locator("button", { hasText: "Run Draw" }).click();
	await page.waitForURL("**/applications**", { timeout: 10000 });
}
