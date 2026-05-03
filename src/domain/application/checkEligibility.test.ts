import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { SQLiteConnectionPool } from "@event-driven-io/emmett-sqlite";
import { checkEligibility } from "./checkEligibility.ts";
import { normalizeName } from "./normalizeName.ts";

async function createTestPool(): Promise<{
	pool: ReturnType<typeof SQLiteConnectionPool>;
	db: Database;
}> {
	const db = new Database(":memory:");
	db.run("PRAGMA journal_mode=WAL");

	const pool = SQLiteConnectionPool({ db: db as never });

	await pool.withConnection(async (conn) => {
		await conn.command(`
			CREATE TABLE IF NOT EXISTS applications (
				ref TEXT NOT NULL UNIQUE,
				id TEXT NOT NULL UNIQUE,
				applicant_id TEXT NOT NULL,
				lottery_name TEXT NOT NULL,
				status TEXT NOT NULL,
				rank INTEGER,
				payment_preference TEXT NOT NULL,
				name TEXT,
				phone TEXT,
				reject_reason TEXT,
				applied_at TEXT,
				accepted_at TEXT,
				selected_at TEXT,
				rejected_at TEXT,
				reviewed_by_volunteer_id TEXT,
				email TEXT,
				meeting_place TEXT,
				sort_code TEXT,
				account_number TEXT,
				poa_ref TEXT
			)
		`);

		await conn.command(`
			CREATE TABLE IF NOT EXISTS lottery_windows (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				lottery_name TEXT NOT NULL UNIQUE,
				started_at TEXT NOT NULL,
				status TEXT NOT NULL
			)
		`);
	});

	return { pool, db };
}

const TEST_NOW = new Date("2026-05-03T12:00:00.000Z");

function daysAgo(n: number): string {
	return new Date(TEST_NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString();
}

describe("checkEligibility", () => {
	let pool: ReturnType<typeof SQLiteConnectionPool>;
	let db: Database;

	beforeEach(async () => {
		const test = await createTestPool();
		pool = test.pool;
		db = test.db;
	});

	afterEach(() => {
		db.close();
	});

	it("eligible — applicant with no prior grants", async () => {
		await pool.withConnection(async (conn) => {
			await conn.command(
				"INSERT INTO lottery_windows (lottery_name, started_at, status) VALUES (?, ?, ?)",
				["2026-05", TEST_NOW.toISOString(), "open"],
			);
		});

		const result = await checkEligibility(
			"applicant-test",
			"Jane Doe",
			undefined,
			"2026-05",
			pool,
			{ cooldownDays: 90 },
		);

		expect(result.status).toBe("eligible");
	});

	it("cooldown — hit (selected within cooldown window)", async () => {
		await pool.withConnection(async (conn) => {
			await conn.command(
				"INSERT INTO lottery_windows (lottery_name, started_at, status) VALUES (?, ?, ?)",
				["2026-05", TEST_NOW.toISOString(), "open"],
			);
			await conn.command(
				`INSERT INTO applications
				 (ref, id, applicant_id, lottery_name, status, payment_preference, name, phone, applied_at, selected_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				[
					"ref00001",
					"app-001",
					"applicant-test",
					"2026-03",
					"selected",
					"bank",
					"Jane Doe",
					"07700900000",
					daysAgo(95),
					daysAgo(30),
				],
			);
		});

		const result = await checkEligibility(
			"applicant-test",
			"Jane Doe",
			undefined,
			"2026-05",
			pool,
			{ cooldownDays: 90 },
		);

		expect(result.status).toBe("cooldown");
		if (result.status === "cooldown") {
			expect(result.lastGrantSelectedAt).toBe(daysAgo(30));
			expect(result.cooldownDays).toBe(90);
			expect(result.eligibleAfter).toBeString();
			const eligible = new Date(result.eligibleAfter).getTime();
			const expected = TEST_NOW.getTime() + 60 * 24 * 60 * 60 * 1000;
			expect(Math.abs(eligible - expected)).toBeLessThan(1000);
		}
	});

	it("cooldown — miss (outside cooldown window)", async () => {
		await pool.withConnection(async (conn) => {
			await conn.command(
				"INSERT INTO lottery_windows (lottery_name, started_at, status) VALUES (?, ?, ?)",
				["2026-05", TEST_NOW.toISOString(), "open"],
			);
			await conn.command(
				`INSERT INTO applications
				 (ref, id, applicant_id, lottery_name, status, payment_preference, name, phone, applied_at, selected_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				[
					"ref00002",
					"app-002",
					"applicant-test",
					"2025-12",
					"selected",
					"bank",
					"Jane Doe",
					"07700900000",
					daysAgo(130),
					daysAgo(120),
				],
			);
		});

		const result = await checkEligibility(
			"applicant-test",
			"Jane Doe",
			undefined,
			"2026-05",
			pool,
			{ cooldownDays: 90 },
		);

		expect(result.status).toBe("eligible");
	});

	it("cooldown — boundary (exactly N days ago, eligible)", async () => {
		await pool.withConnection(async (conn) => {
			await conn.command(
				"INSERT INTO lottery_windows (lottery_name, started_at, status) VALUES (?, ?, ?)",
				["2026-05", TEST_NOW.toISOString(), "open"],
			);
			await conn.command(
				`INSERT INTO applications
				 (ref, id, applicant_id, lottery_name, status, payment_preference, name, phone, applied_at, selected_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				[
					"ref00003",
					"app-003",
					"applicant-test",
					"2026-01",
					"selected",
					"bank",
					"Jane Doe",
					"07700900000",
					daysAgo(95),
					daysAgo(90),
				],
			);
		});

		const result = await checkEligibility(
			"applicant-test",
			"Jane Doe",
			undefined,
			"2026-05",
			pool,
			{ cooldownDays: 90 },
		);

		expect(result.status).toBe("eligible");
	});

	it("duplicate — same lottery, same applicant", async () => {
		await pool.withConnection(async (conn) => {
			await conn.command(
				"INSERT INTO lottery_windows (lottery_name, started_at, status) VALUES (?, ?, ?)",
				["2026-05", TEST_NOW.toISOString(), "open"],
			);
			await conn.command(
				`INSERT INTO applications
				 (ref, id, applicant_id, lottery_name, status, payment_preference, name, phone, applied_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				[
					"ref00004",
					"app-004",
					"applicant-test",
					"2026-05",
					"accepted",
					"bank",
					"Jane Doe",
					"07700900000",
					daysAgo(1),
				],
			);
		});

		const result = await checkEligibility(
			"applicant-test",
			"Jane Doe",
			undefined,
			"2026-05",
			pool,
			{ cooldownDays: 90 },
		);

		expect(result.status).toBe("duplicate");
		if (result.status === "duplicate") {
			expect(result.appliedAt).toBeString();
			expect(result.ref).toBe("ref00004");
		}
	});

	it("duplicate — ignores rejected and flagged applicants", async () => {
		await pool.withConnection(async (conn) => {
			await conn.command(
				"INSERT INTO lottery_windows (lottery_name, started_at, status) VALUES (?, ?, ?)",
				["2026-05", TEST_NOW.toISOString(), "open"],
			);
			await conn.command(
				`INSERT INTO applications
				 (ref, id, applicant_id, lottery_name, status, payment_preference, name, phone, applied_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				[
					"ref00005",
					"app-005",
					"applicant-test",
					"2026-05",
					"rejected",
					"bank",
					"Jane Doe",
					"07700900000",
					daysAgo(2),
				],
			);
			await conn.command(
				`INSERT INTO applications
				 (ref, id, applicant_id, lottery_name, status, payment_preference, name, phone, applied_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				[
					"ref00006",
					"app-006",
					"applicant-test",
					"2026-05",
					"flagged",
					"bank",
					"Jane Doe",
					"07700900000",
					daysAgo(1),
				],
			);
		});

		const result = await checkEligibility(
			"applicant-test",
			"Jane Doe",
			undefined,
			"2026-05",
			pool,
			{ cooldownDays: 90 },
		);

		expect(result.status).toBe("eligible");
	});

	it("duplicate by email — same name+email, same lottery", async () => {
		await pool.withConnection(async (conn) => {
			await conn.command(
				"INSERT INTO lottery_windows (lottery_name, started_at, status) VALUES (?, ?, ?)",
				["2026-05", TEST_NOW.toISOString(), "open"],
			);
			await conn.command(
				`INSERT INTO applications
				 (ref, id, applicant_id, lottery_name, status, payment_preference, name, phone, email, applied_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				[
					"ref00007",
					"app-007",
					"applicant-other",
					"2026-05",
					"accepted",
					"bank",
					normalizeName("Jane Doe"),
					"07700900001",
					"jane@example.com",
					daysAgo(1),
				],
			);
		});

		const result = await checkEligibility(
			"applicant-test",
			"Jane Doe",
			"jane@example.com",
			"2026-05",
			pool,
			{ cooldownDays: 90 },
		);

		expect(result.status).toBe("duplicate");
	});

	it("window_closed — no lottery_windows table", async () => {
		await pool.withConnection(async (conn) => {
			await conn.command("DROP TABLE IF EXISTS lottery_windows");
		});

		const result = await checkEligibility(
			"applicant-test",
			"Jane Doe",
			undefined,
			"2026-05",
			pool,
			{ cooldownDays: 90 },
		);

		expect(result.status).toBe("window_closed");
	});

	it("window_closed — window exists but not open", async () => {
		await pool.withConnection(async (conn) => {
			await conn.command(
				"INSERT INTO lottery_windows (lottery_name, started_at, status) VALUES (?, ?, ?)",
				["2026-05", TEST_NOW.toISOString(), "closed"],
			);
		});

		const result = await checkEligibility(
			"applicant-test",
			"Jane Doe",
			undefined,
			"2026-05",
			pool,
			{ cooldownDays: 90 },
		);

		expect(result.status).toBe("window_closed");
	});

	it("skipWindowCheck — bypasses window entirely", async () => {
		await pool.withConnection(async (conn) => {
			await conn.command("DROP TABLE IF EXISTS lottery_windows");
		});

		const result = await checkEligibility(
			"applicant-test",
			"Jane Doe",
			undefined,
			"2026-05",
			pool,
			{ skipWindowCheck: true, cooldownDays: 90 },
		);

		expect(result.status).toBe("eligible");
	});

	it("excludeApplicationId — excluded from duplicate, cooldown still applies", async () => {
		await pool.withConnection(async (conn) => {
			await conn.command(
				"INSERT INTO lottery_windows (lottery_name, started_at, status) VALUES (?, ?, ?)",
				["2026-05", TEST_NOW.toISOString(), "open"],
			);
			await conn.command(
				`INSERT INTO applications
				 (ref, id, applicant_id, lottery_name, status, payment_preference, name, phone, applied_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				[
					"ref00008",
					"app-exclude",
					"applicant-test",
					"2026-05",
					"accepted",
					"bank",
					"Jane Doe",
					"07700900000",
					daysAgo(1),
				],
			);
			await conn.command(
				`INSERT INTO applications
				 (ref, id, applicant_id, lottery_name, status, payment_preference, name, phone, applied_at, selected_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				[
					"ref00009",
					"app-009",
					"applicant-test",
					"2026-04",
					"selected",
					"bank",
					"Jane Doe",
					"07700900000",
					daysAgo(40),
					daysAgo(30),
				],
			);
		});

		const result = await checkEligibility(
			"applicant-test",
			"Jane Doe",
			undefined,
			"2026-05",
			pool,
			{ excludeApplicationId: "app-exclude", cooldownDays: 90 },
		);

		expect(result.status).toBe("cooldown");
	});

	it("cooldown — returns most recent selected grant only", async () => {
		await pool.withConnection(async (conn) => {
			await conn.command(
				"INSERT INTO lottery_windows (lottery_name, started_at, status) VALUES (?, ?, ?)",
				["2026-05", TEST_NOW.toISOString(), "open"],
			);
			await conn.command(
				`INSERT INTO applications
				 (ref, id, applicant_id, lottery_name, status, payment_preference, name, phone, applied_at, selected_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				[
					"ref00010",
					"app-010",
					"applicant-test",
					"2025-06",
					"selected",
					"bank",
					"Jane Doe",
					"07700900000",
					daysAgo(360),
					daysAgo(350),
				],
			);
			await conn.command(
				`INSERT INTO applications
				 (ref, id, applicant_id, lottery_name, status, payment_preference, name, phone, applied_at, selected_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				[
					"ref00011",
					"app-011",
					"applicant-test",
					"2026-04",
					"selected",
					"bank",
					"Jane Doe",
					"07700900000",
					daysAgo(40),
					daysAgo(30),
				],
			);
		});

		const result = await checkEligibility(
			"applicant-test",
			"Jane Doe",
			undefined,
			"2026-05",
			pool,
			{ cooldownDays: 90 },
		);

		expect(result.status).toBe("cooldown");
		if (result.status === "cooldown") {
			expect(result.lastGrantSelectedAt).toBe(daysAgo(30));
		}
	});
});
