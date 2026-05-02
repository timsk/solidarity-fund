import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type {
	SQLiteConnectionPool,
	SQLiteEventStore,
} from "@event-driven-io/emmett-sqlite";
import type { GrantRepository } from "../../src/domain/grant/repository.ts";
import type { GrantEvent } from "../../src/domain/grant/types.ts";
import { createEventStore } from "../../src/infrastructure/eventStore.ts";
import { SQLiteGrantRepository } from "../../src/infrastructure/grant/sqliteGrantRepository.ts";

describe("SQLiteGrantRepository", () => {
	let eventStore: SQLiteEventStore;
	let pool: ReturnType<typeof SQLiteConnectionPool>;
	let repo: GrantRepository;

	beforeEach(async () => {
		const es = createEventStore(":memory:");
		eventStore = es.store;
		pool = es.pool;
		repo = SQLiteGrantRepository(pool);

		// Create applicants + volunteers tables for JOIN
		await pool.withConnection(async (conn) => {
			await conn.command(`
				CREATE TABLE IF NOT EXISTS applicants (
					id TEXT PRIMARY KEY,
					phone TEXT NOT NULL,
					name TEXT NOT NULL,
					email TEXT,
					created_at TEXT NOT NULL,
					updated_at TEXT NOT NULL
				)
			`);
			await conn.command(`
				CREATE TABLE IF NOT EXISTS volunteers (
					id TEXT PRIMARY KEY,
					name TEXT NOT NULL,
					phone TEXT,
					email TEXT,
					password_hash TEXT NOT NULL,
					is_admin INTEGER NOT NULL DEFAULT 0,
					is_disabled INTEGER NOT NULL DEFAULT 0,
					requires_password_reset INTEGER NOT NULL DEFAULT 0,
					created_at TEXT NOT NULL,
					updated_at TEXT NOT NULL
				)
			`);
			await conn.command(
				"INSERT INTO applicants (id, phone, name, email, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
				["a1", "07700900001", "Alice Smith", null, "2026-01-01", "2026-01-01"],
			);
			await conn.command(
				"INSERT INTO volunteers (id, name, phone, email, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
				["v1", "Bob Volunteer", null, null, "hash", "2026-01-01", "2026-01-01"],
			);
		});
	});

	afterEach(async () => {
		await pool.close();
	});

	async function createGrant(
		id: string,
		opts?: {
			applicantId?: string;
			lotteryName?: string;
			rank?: number;
			paymentPreference?: string;
		},
	) {
		await eventStore.appendToStream<GrantEvent>(`grant-${id}`, [
			{
				type: "GrantCreated",
				data: {
					grantId: id,
					applicationId: `app-${id}`,
					applicantId: opts?.applicantId ?? "a1",
					lotteryName: opts?.lotteryName ?? "2026-03",
					rank: opts?.rank ?? 1,
					paymentPreference: (opts?.paymentPreference ?? "bank") as
						| "bank"
						| "cash",
					createdAt: "2026-03-01T00:00:00.000Z",
				},
			},
		]);
	}

	test("getById returns grant with joined applicant and volunteer names", async () => {
		await createGrant("g1");
		await eventStore.appendToStream<GrantEvent>("grant-g1", [
			{
				type: "VolunteerAssigned",
				data: { grantId: "g1", volunteerId: "v1", assignedAt: "2026-03-02" },
			},
		]);

		const grant = await repo.getById("g1");
		expect(grant).not.toBeNull();
		expect(grant?.applicantName).toBe("Alice Smith");
		expect(grant?.volunteerName).toBe("Bob Volunteer");
		expect(grant?.status).toBe("awaiting_review");
	});

	test("getById returns null for unknown grant", async () => {
		const grant = await repo.getById("nonexistent");
		expect(grant).toBeNull();
	});

	test("listByLottery returns grants ordered by rank", async () => {
		await createGrant("g1", { rank: 2 });
		await createGrant("g2", { rank: 1 });

		const grants = await repo.listByLottery("2026-03");
		expect(grants).toHaveLength(2);
		expect(grants[0]?.rank).toBe(1);
		expect(grants[1]?.rank).toBe(2);
	});

	test("listByLottery filters by month cycle", async () => {
		await createGrant("g1", { lotteryName: "2026-03" });
		await createGrant("g2", { lotteryName: "2026-04" });

		const march = await repo.listByLottery("2026-03");
		expect(march).toHaveLength(1);
		expect(march[0]?.id).toBe("g1");
	});

	test("listDistinctLotteries returns months in descending order", async () => {
		await createGrant("g1", { lotteryName: "2026-02" });
		await createGrant("g2", { lotteryName: "2026-03" });

		const months = await repo.listDistinctLotteries();
		expect(months).toEqual(["2026-03", "2026-02"]);
	});

	test("listByLottery returns empty array for unknown month", async () => {
		const grants = await repo.listByLottery("2099-01");
		expect(grants).toEqual([]);
	});

	test("GrantCreated with bankDetails stores sortCode, accountNumber, proofOfAddressRef", async () => {
		await eventStore.appendToStream<GrantEvent>("grant-g-bank-full", [
			{
				type: "GrantCreated",
				data: {
					grantId: "g-bank-full",
					applicationId: "app-g-bank-full",
					applicantId: "a1",
					lotteryName: "2026-03",
					rank: 1,
					paymentPreference: "bank",
					createdAt: "2026-03-01T00:00:00.000Z",
					bankDetails: {
						sortCode: "12-34-56",
						accountNumber: "12345678",
						proofOfAddressRef: "poa-ref-1",
					},
				},
			},
		]);

		const grant = await repo.getById("g-bank-full");
		expect(grant?.status).toBe("awaiting_review");
		expect(grant?.sortCode).toBe("12-34-56");
		expect(grant?.accountNumber).toBe("12345678");
		expect(grant?.proofOfAddressRef).toBe("poa-ref-1");
	});

	describe("updateNotes", () => {
		test("persists notes on the grant", async () => {
			await createGrant("g-notes");

			await repo.updateNotes("g-notes", "Call applicant Tuesday");

			const grant = await repo.getById("g-notes");
			expect(grant?.notes).toBe("Call applicant Tuesday");
		});

		test("clears notes when empty string provided", async () => {
			await createGrant("g-notes-clear");
			await repo.updateNotes("g-notes-clear", "Initial note");
			await repo.updateNotes("g-notes-clear", "");
			const grant = await repo.getById("g-notes-clear");
			expect(grant?.notes).toBeNull();
		});
	});

	test("BankDetailsUpdated updates sortCode and accountNumber", async () => {
		await createGrant("g-bank");
		await eventStore.appendToStream<GrantEvent>("grant-g-bank", [
			{
				type: "BankDetailsUpdated",
				data: {
					grantId: "g-bank",
					sortCode: "99-88-77",
					accountNumber: "99887766",
					updatedAt: "2026-03-02T00:00:00.000Z",
				},
			},
		]);

		const grant = await repo.getById("g-bank");
		expect(grant?.status).toBe("awaiting_review");
		expect(grant?.sortCode).toBe("99-88-77");
		expect(grant?.accountNumber).toBe("99887766");
	});
});
