import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { GrantEvent } from "../../src/domain/grant/types.ts";
import { SQLiteGrantRepository } from "../../src/infrastructure/grant/sqliteGrantRepository.ts";
import { DocumentStore } from "../../src/infrastructure/projections/documents.ts";
import { SQLiteVolunteerRepository } from "../../src/infrastructure/volunteer/sqliteVolunteerRepository.ts";
import { createGrantRoutes } from "../../src/web/routes/grants.ts";
import { createTestEnv, type TestEnv } from "./helpers/testEventStore.ts";

describe("grant routes", () => {
	let env: TestEnv;
	let routes: ReturnType<typeof createGrantRoutes>;

	beforeEach(async () => {
		env = await createTestEnv();
		const grantRepo = SQLiteGrantRepository(env.pool);
		const volunteerRepo = await SQLiteVolunteerRepository(env.pool);
		const docStore = DocumentStore(env.pool);
		await docStore.init();
		routes = createGrantRoutes(
			grantRepo,
			volunteerRepo,
			docStore,
			env.eventStore,
			env.pool,
		);

		// Seed an applicant for the grant FK (required by the grants projection JOIN)
		await env.pool.withConnection(async (conn) => {
			await conn.command(
				"INSERT OR IGNORE INTO applicants (id, phone, name, email, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
				["a1", "07700900001", "Alice", null, "2026-01-01", "2026-01-01"],
			);
		});
	});

	afterEach(async () => {
		await env.cleanup();
	});

	async function createGrant(id: string) {
		await env.eventStore.appendToStream<GrantEvent>(`grant-${id}`, [
			{
				type: "GrantCreated",
				data: {
					grantId: id,
					applicationId: `app-${id}`,
					applicantId: "a1",
					lotteryName: "2026-03",
					rank: 1,
					paymentPreference: "cash",
					createdAt: "2026-03-01T00:00:00.000Z",
				},
			},
		]);
	}

	describe("handleUpdateNotes", () => {
		test("saves notes and returns SSE", async () => {
			await createGrant("g1");

			const req = new Request("http://localhost/grants/g1/notes", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ grantnotes: "follow up Friday" }),
			});

			const res = await routes.handleUpdateNotes("g1", req);
			expect(res.status).toBe(200);
			expect(res.headers.get("Content-Type")).toBe("text/event-stream");

			// Verify persistence directly via repository
			const grant = await SQLiteGrantRepository(env.pool).getById("g1");
			expect(grant?.notes).toBe("follow up Friday");
		});

		test("returns 400 for malformed request body", async () => {
			const req = new Request("http://localhost/grants/x/notes", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: "not-json",
			});
			const res = await routes.handleUpdateNotes("x", req);
			expect(res.status).toBe(400);
		});
	});
});
