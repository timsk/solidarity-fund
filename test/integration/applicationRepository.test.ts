import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type {
	SQLiteConnectionPool,
	SQLiteEventStore,
} from "@event-driven-io/emmett-sqlite";
import type { ApplicationRepository } from "../../src/domain/application/repository.ts";
import { SQLiteApplicationRepository } from "../../src/infrastructure/application/sqliteApplicationRepository.ts";
import { createEventStore } from "../../src/infrastructure/eventStore.ts";

describe("SQLiteApplicationRepository", () => {
	let eventStore: SQLiteEventStore;
	let pool: ReturnType<typeof SQLiteConnectionPool>;
	let repo: ApplicationRepository;

	beforeEach(async () => {
		const es = createEventStore(":memory:");
		eventStore = es.store;
		pool = es.pool;
		repo = SQLiteApplicationRepository(pool);
	});

	afterEach(async () => {
		await pool.close();
	});

	async function seedApplication(
		id: string,
		lotteryName: string,
		name: string,
		phone: string,
	) {
		await eventStore.appendToStream(`application-${id}`, [
			{
				type: "ApplicationSubmitted",
				data: {
					applicationId: id,
					applicantId: `applicant-${phone}`,
					identity: { phone, name },
					paymentPreference: "cash",
					meetingDetails: { place: "Mill Road" },
					lotteryName,
					submittedAt: "2026-03-01T10:00:00Z",
				},
			},
			{
				type: "ApplicationAccepted",
				data: {
					applicationId: id,
					applicantId: `applicant-${phone}`,
					lotteryName,
					acceptedAt: "2026-03-01T10:00:00Z",
				},
			},
		]);
	}

	test("getById returns application", async () => {
		await seedApplication("app-1", "2026-03", "Alice", "07700900001");
		const app = await repo.getById("app-1");
		expect(app).not.toBeNull();
		expect(app!.name).toBe("Alice");
		expect(app!.status).toBe("accepted");
	});

	test("getById returns null for unknown id", async () => {
		const app = await repo.getById("nonexistent");
		expect(app).toBeNull();
	});

	test("getByRef returns application by uuid-derived ref", async () => {
		await seedApplication(
			"a3f2b1c4-0000-0000-0000-000000000000",
			"2026-03",
			"Alice",
			"07700900001",
		);
		const byRef = await repo.getByRef("a3f2b1c4");
		expect(byRef).not.toBeNull();
		expect(byRef!.id).toBe("a3f2b1c4-0000-0000-0000-000000000000");
		expect(byRef!.name).toBe("Alice");
		expect(byRef!.ref).toBe("a3f2b1c4");
	});

	test("getByRef returns null for unknown ref", async () => {
		const app = await repo.getByRef("00000000");
		expect(app).toBeNull();
	});

	test("		listByLottery returns applications for given month", async () => {
		await seedApplication("app-1", "2026-03", "Alice", "07700900001");
		await seedApplication("app-2", "2026-03", "Bob", "07700900002");
		await seedApplication("app-3", "2026-04", "Charlie", "07700900003");

		const march = await repo.listByLottery("2026-03");
		expect(march).toHaveLength(2);

		const april = await repo.listByLottery("2026-04");
		expect(april).toHaveLength(1);
	});

	test("		listByLottery filters by status", async () => {
		await seedApplication("app-1", "2026-03", "Alice", "07700900001");
		await seedApplication("app-2", "2026-03", "Bob", "07700900002");
		// Reject app-2
		await eventStore.appendToStream("application-app-2", [
			{
				type: "ApplicationRejected",
				data: {
					applicationId: "app-2",
					applicantId: "applicant-07700900002",
					reason: "cooldown",
					detail: "test",
					lotteryName: "2026-03",
					rejectedAt: "2026-03-02T10:00:00Z",
				},
			},
		]);

		const accepted = await repo.listByLottery("2026-03", {
			status: "accepted",
		});
		expect(accepted).toHaveLength(1);
		expect(accepted[0]!.name).toBe("Alice");

		const rejected = await repo.listByLottery("2026-03", {
			status: "rejected",
		});
		expect(rejected).toHaveLength(1);
		expect(rejected[0]!.name).toBe("Bob");
	});

	test("		listByLottery filters by payment preference", async () => {
		await seedApplication("app-1", "2026-03", "Alice", "07700900001");
		// app-1 is seeded with "cash", add a "bank" one
		await eventStore.appendToStream("application-app-2", [
			{
				type: "ApplicationSubmitted",
				data: {
					applicationId: "app-2",
					applicantId: "applicant-07700900002",
					identity: { phone: "07700900002", name: "Bob" },
					paymentPreference: "bank",
					meetingDetails: { place: "Mill Road" },
					lotteryName: "2026-03",
					submittedAt: "2026-03-01T10:00:00Z",
				},
			},
			{
				type: "ApplicationAccepted",
				data: {
					applicationId: "app-2",
					applicantId: "applicant-07700900002",
					lotteryName: "2026-03",
					acceptedAt: "2026-03-01T10:00:00Z",
				},
			},
		]);

		const cash = await repo.listByLottery("2026-03", {
			paymentPreference: "cash",
		});
		expect(cash).toHaveLength(1);
		expect(cash[0]!.name).toBe("Alice");

		const bank = await repo.listByLottery("2026-03", {
			paymentPreference: "bank",
		});
		expect(bank).toHaveLength(1);
		expect(bank[0]!.name).toBe("Bob");
	});

	test("		listByLottery with no filters returns all", async () => {
		await seedApplication("app-1", "2026-03", "Alice", "07700900001");
		await seedApplication("app-2", "2026-03", "Bob", "07700900002");
		const all = await repo.listByLottery("2026-03", {});
		expect(all).toHaveLength(2);
	});

	test("listDistinctLotteries returns sorted month cycles", async () => {
		await seedApplication("app-1", "2026-03", "Alice", "07700900001");
		await seedApplication("app-2", "2026-04", "Bob", "07700900002");
		await seedApplication("app-3", "2026-03", "Charlie", "07700900003");

		const months = await repo.listDistinctLotteries();
		expect(months).toEqual(["2026-04", "2026-03"]);
	});
});
