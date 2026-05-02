import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { ApplicationRepository } from "../../src/domain/application/repository.ts";
import { SQLiteApplicationRepository } from "../../src/infrastructure/application/sqliteApplicationRepository.ts";
import { createApplicationRoutes } from "../../src/web/routes/applications.ts";
import { createTestEnv, type TestEnv } from "./helpers/testEventStore.ts";

describe("application routes", () => {
	let env: TestEnv;
	let appRepo: ApplicationRepository;
	let routes: ReturnType<typeof createApplicationRoutes>;

	beforeEach(async () => {
		env = await createTestEnv();
		appRepo = SQLiteApplicationRepository(env.pool);
		routes = createApplicationRoutes(
			appRepo,
			env.applicantRepo,
			env.volunteerRepo,
			env.eventStore,
			env.pool,
		);
	});

	afterEach(async () => {
		await env.cleanup();
	});

	test("list returns empty state for month with no applications", async () => {
		const res = await routes.list("2026-03");
		const html = await res.text();
		expect(html).toContain("No applications");
	});

	test("detail returns SSE content-type", async () => {
		// Seed minimal app for SSE format check
		await env.eventStore.appendToStream("application-app-1", [
			{
				type: "ApplicationSubmitted",
				data: {
					applicationId: "app-1",
					applicantId: "applicant-1",
					identity: { phone: "07700900001", name: "Alice" },
					paymentPreference: "bank",
					meetingDetails: { place: "Mill Road" },
					lotteryName: "2026-03",
					submittedAt: "2026-03-01T00:00:00Z",
				},
			},
			{
				type: "ApplicationAccepted",
				data: {
					applicationId: "app-1",
					applicantId: "applicant-1",
					lotteryName: "2026-03",
					acceptedAt: "2026-03-01T00:00:01Z",
				},
			},
		]);

		const res = await routes.detail("app-1");
		expect(res.headers.get("Content-Type")).toBe("text/event-stream");
	});

	test("detail returns 404 for unknown id", async () => {
		const res = await routes.detail("nonexistent");
		expect(res.status).toBe(404);
	});

	test("closePanel returns SSE", () => {
		const res = routes.closePanel();
		expect(res.headers.get("Content-Type")).toBe("text/event-stream");
	});
});
