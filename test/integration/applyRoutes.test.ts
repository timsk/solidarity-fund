import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createChallenge, solveChallenge } from "altcha-lib/v1";
import { SQLiteApplicationRepository } from "../../src/infrastructure/application/sqliteApplicationRepository.ts";
import { DocumentStore } from "../../src/infrastructure/projections/documents.ts";
import { createApplyRoutes } from "../../src/web/routes/apply.ts";
import { createTestEnv, type TestEnv } from "./helpers/testEventStore.ts";

describe("apply routes", () => {
	let env: TestEnv;
	let routes: ReturnType<typeof createApplyRoutes>;
	const hmacKey = "test-hmac-key";

	async function generateAltchaToken(): Promise<string> {
		const challenge = await createChallenge({ hmacKey, maxNumber: 10 });
		const solver = solveChallenge(
			challenge.challenge,
			challenge.salt,
			challenge.algorithm,
			challenge.maxnumber,
		);
		const solution = await solver.promise;
		return btoa(
			JSON.stringify({
				algorithm: challenge.algorithm,
				challenge: challenge.challenge,
				number: solution.number,
				salt: challenge.salt,
				signature: challenge.signature,
			}),
		);
	}

	beforeEach(async () => {
		env = await createTestEnv();
		const docStore = DocumentStore(env.pool);
		await docStore.init();
		routes = createApplyRoutes(
			env.eventStore,
			env.pool,
			env.applicantRepo,
			hmacKey,
			docStore,
			SQLiteApplicationRepository(env.pool),
		);
	});

	afterEach(async () => {
		await env.cleanup();
	});

	test("showForm returns closed page when no window is open", async () => {
		const res = await routes.showForm();
		const html = await res.text();
		expect(html).toContain("closed");
	});

	test("handleSubmit returns 400 when altcha token is missing", async () => {
		await env.eventStore.appendToStream("lottery-2026-03", [
			{
				type: "ApplicationWindowOpened",
				data: { lotteryName: "2026-03", openedAt: "2026-03-01T00:00:00Z" },
			},
		]);

		const form = new URLSearchParams({
			name: "Alice",
			phone: "07700900001",
			meetingPlace: "Mill Road",
			paymentPreference: "cash",
		});

		const req = new Request("http://localhost/apply", {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: form.toString(),
		});

		const res = await routes.handleSubmit(req);
		expect(res.status).toBe(400);
		const text = await res.text();
		expect(text).toContain("verification");
	});

	test("handleSubmit returns 400 when name is missing", async () => {
		const altchaToken = await generateAltchaToken();
		const form = new URLSearchParams({
			phone: "07700900001",
			meetingPlace: "Mill Road",
			paymentPreference: "cash",
		});
		form.set("altcha", altchaToken);

		const req = new Request("http://localhost/apply", {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: form.toString(),
		});

		const res = await routes.handleSubmit(req);
		expect(res.status).toBe(400);
	});

	describe("bank payment validation", () => {
		async function submitBankForm(
			overrides: Record<string, string>,
		): Promise<Response> {
			const altchaToken = await generateAltchaToken();
			const form = new URLSearchParams({
				name: "Alice",
				phone: "07700900001",
				meetingPlace: "Mill Road",
				paymentPreference: "bank",
				sortCode: "12-34-56",
				accountNumber: "12345678",
				...overrides,
			});
			form.set("altcha", altchaToken);
			return routes.handleSubmit(
				new Request("http://localhost/apply", {
					method: "POST",
					headers: { "Content-Type": "application/x-www-form-urlencoded" },
					body: form.toString(),
				}),
			);
		}

		test("returns 400 when sort code is missing", async () => {
			const res = await submitBankForm({ sortCode: "" });
			expect(res.status).toBe(400);
			expect(await res.text()).toContain("Sort code");
		});

		test("returns 400 when account number is missing", async () => {
			const res = await submitBankForm({ accountNumber: "" });
			expect(res.status).toBe(400);
			expect(await res.text()).toContain("account number");
		});

		test("returns 400 for invalid sort code format", async () => {
			const res = await submitBankForm({ sortCode: "1234" });
			expect(res.status).toBe(400);
			expect(await res.text()).toContain("Sort code");
		});

		test("returns 400 for invalid account number format", async () => {
			const res = await submitBankForm({ accountNumber: "1234" });
			expect(res.status).toBe(400);
			expect(await res.text()).toContain("Account number");
		});

		test("accepts sort code without dashes", async () => {
			const res = await submitBankForm({ sortCode: "123456" });
			expect(res.status).not.toBe(400);
		});

		test("accepts sort code with dashes", async () => {
			const res = await submitBankForm({ sortCode: "12-34-56" });
			expect(res.status).not.toBe(400);
		});

		test("cash payment does not require bank fields", async () => {
			const altchaToken = await generateAltchaToken();
			const form = new URLSearchParams({
				name: "Bob",
				phone: "07700900002",
				meetingPlace: "Mill Road",
				paymentPreference: "cash",
			});
			form.set("altcha", altchaToken);
			const res = await routes.handleSubmit(
				new Request("http://localhost/apply", {
					method: "POST",
					headers: { "Content-Type": "application/x-www-form-urlencoded" },
					body: form.toString(),
				}),
			);
			expect(res.status).not.toBe(400);
		});

		test("rejects cash payment without meetingPlace", async () => {
			const altchaToken = await generateAltchaToken();
			const form = new URLSearchParams({
				name: "Alice",
				phone: "07700900001",
				paymentPreference: "cash",
			});
			form.set("altcha", altchaToken);

			const res = await routes.handleSubmit(
				new Request("http://localhost/apply", {
					method: "POST",
					headers: { "Content-Type": "application/x-www-form-urlencoded" },
					body: form.toString(),
				}),
			);
			expect(res.status).toBe(400);
			expect(await res.text()).toContain("Meeting place");
		});
	});

	describe("POA file upload", () => {
		beforeEach(async () => {
			await env.eventStore.appendToStream("lottery-2026-03", [
				{
					type: "ApplicationWindowOpened",
					data: { lotteryName: "2026-03", openedAt: "2026-03-01T00:00:00Z" },
				},
			]);
		});

		test("bank payment with POA file stores document and redirects to result", async () => {
			const altchaToken = await generateAltchaToken();
			const poaFile = new File([Buffer.from("fake-pdf-content")], "poa.pdf", {
				type: "application/pdf",
			});

			const formData = new FormData();
			formData.set("name", "Alice");
			formData.set("phone", "07700900050");
			formData.set("meetingPlace", "Mill Road");
			formData.set("paymentPreference", "bank");
			formData.set("sortCode", "12-34-56");
			formData.set("accountNumber", "12345678");
			formData.set("poa", poaFile);
			formData.set("altcha", altchaToken);

			const res = await routes.handleSubmit(
				new Request("http://localhost/apply", {
					method: "POST",
					body: formData,
				}),
			);

			expect(res.status).toBe(302);
			expect(res.headers.get("location")).toContain("/apply/result");
		});

		test("bank payment without POA still succeeds and redirects", async () => {
			const altchaToken = await generateAltchaToken();
			const formData = new FormData();
			formData.set("name", "Charlie");
			formData.set("phone", "07700900051");
			formData.set("meetingPlace", "Mill Road");
			formData.set("paymentPreference", "bank");
			formData.set("sortCode", "12-34-56");
			formData.set("accountNumber", "12345678");
			formData.set("altcha", altchaToken);

			const res = await routes.handleSubmit(
				new Request("http://localhost/apply", {
					method: "POST",
					body: formData,
				}),
			);

			expect(res.status).toBe(302);
		});
	});
});
