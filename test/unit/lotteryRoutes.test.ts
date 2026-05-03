import { describe, expect, test } from "bun:test";

describe("lottery applicant pool filter", () => {
	const makeApp = (id: string, status: string) => ({
		id,
		applicantId: `applicant-${id}`,
		status,
	});

	const filterPool = (
		applications: { id: string; applicantId: string; status: string }[],
	) =>
		applications
			.filter((a) => a.status === "accepted" || a.status === "confirmed")
			.map((a) => ({
				applicationId: a.id,
				applicantId: a.applicantId,
			}));

	test("includes accepted applications", () => {
		const pool = filterPool([makeApp("app-1", "accepted")]);
		expect(pool).toEqual([
			{ applicationId: "app-1", applicantId: "applicant-app-1" },
		]);
	});

	test("includes confirmed applications", () => {
		const pool = filterPool([makeApp("app-1", "confirmed")]);
		expect(pool).toEqual([
			{ applicationId: "app-1", applicantId: "applicant-app-1" },
		]);
	});

	test("includes both accepted and confirmed", () => {
		const pool = filterPool([
			makeApp("app-1", "accepted"),
			makeApp("app-2", "confirmed"),
			makeApp("app-3", "rejected"),
			makeApp("app-4", "flagged"),
		]);
		expect(pool).toHaveLength(2);
		expect(pool.map((p) => p.applicationId)).toEqual(["app-1", "app-2"]);
	});

	test("excludes other statuses", () => {
		const pool = filterPool([
			makeApp("app-1", "flagged"),
			makeApp("app-2", "rejected"),
			makeApp("app-3", "submitted"),
			makeApp("app-4", "selected"),
			makeApp("app-5", "not_selected"),
		]);
		expect(pool).toHaveLength(0);
	});
});

describe("autoCloseExpiredLottery", () => {
	function makeMockPool(rows: unknown[] | null) {
		return {
			withConnection: async (
				fn: (conn: { query: () => unknown }) => unknown,
			) => {
				if (rows === null) throw new Error("db error");
				return fn({
					query: () => rows,
				});
			},
		};
	}

	const mockEventStore = {};

	test("does nothing when no open lottery", async () => {
		const { autoCloseExpiredLottery } = await import(
			"../../src/web/routes/utils.ts"
		);
		const pool = makeMockPool([]);
		let closeCalled = false;
		const result = await autoCloseExpiredLottery(
			pool,
			mockEventStore,
			async () => {
				closeCalled = true;
			},
		);
		expect(result).toBe(false);
		expect(closeCalled).toBe(false);
	});

	test("does nothing when expected_closing_at is in the future", async () => {
		const { autoCloseExpiredLottery } = await import(
			"../../src/web/routes/utils.ts"
		);
		const pool = makeMockPool([
			{
				lottery_name: "2026-12",
				expected_closing_at: "2099-01-01T00:00:00.000Z",
			},
		]);
		let closeCalled = false;
		const result = await autoCloseExpiredLottery(
			pool,
			mockEventStore,
			async () => {
				closeCalled = true;
			},
		);
		expect(result).toBe(false);
		expect(closeCalled).toBe(false);
	});

	test("calls closeApplicationWindow when expected_closing_at is in the past", async () => {
		const { autoCloseExpiredLottery } = await import(
			"../../src/web/routes/utils.ts"
		);
		const pool = makeMockPool([
			{
				lottery_name: "2026-04",
				expected_closing_at: "2020-01-01T00:00:00.000Z",
			},
		]);
		let closeArgs: [string, unknown] | null = null;
		const result = await autoCloseExpiredLottery(
			pool,
			mockEventStore,
			async (lotteryName: string, es: unknown) => {
				closeArgs = [lotteryName, es];
			},
		);
		expect(result).toBe(true);
		expect(closeArgs).toEqual(["2026-04", mockEventStore]);
	});

	test("is idempotent — second call is no-op", async () => {
		const { autoCloseExpiredLottery } = await import(
			"../../src/web/routes/utils.ts"
		);
		let closeCallCount = 0;
		let callCount = 0;
		const pool = {
			withConnection: async (
				fn: (conn: { query: () => unknown }) => unknown,
			) => {
				callCount++;
				if (callCount === 1) {
					return fn({
						query: () => [
							{
								lottery_name: "2026-04",
								expected_closing_at: "2020-01-01T00:00:00.000Z",
							},
						],
					});
				}
				return fn({
					query: () => [],
				});
			},
		};

		const first = await autoCloseExpiredLottery(
			pool,
			mockEventStore,
			async () => {
				closeCallCount++;
			},
		);
		expect(first).toBe(true);
		expect(closeCallCount).toBe(1);

		const second = await autoCloseExpiredLottery(
			pool,
			mockEventStore,
			async () => {
				closeCallCount++;
			},
		);
		expect(second).toBe(false);
		expect(closeCallCount).toBe(1);
	});
});

describe("getCurrentLotteryName", () => {
	function makeMockPool(queryResults: unknown[][] | null) {
		let callIndex = 0;
		return {
			withConnection: async (
				fn: (conn: { query: () => unknown }) => unknown,
			) => {
				if (queryResults === null) throw new Error("db error");
				const results = queryResults;
				return fn({
					query: () => {
						const row = results[callIndex % results.length]!;
						callIndex++;
						return row;
					},
				});
			},
		};
	}

	test("returns default name when no lottery_windows table", async () => {
		const { getCurrentLotteryName, defaultLotteryName } = await import(
			"../../src/web/routes/utils.ts"
		);
		const pool = makeMockPool([[]]);
		const name = await getCurrentLotteryName(pool as never);
		expect(name).toBe(defaultLotteryName());
	});

	test("returns the open lottery when a drawn lottery sorts later alphabetically", async () => {
		const { getCurrentLotteryName } = await import(
			"../../src/web/routes/utils.ts"
		);
		const pool = makeMockPool([
			[{ name: "lottery_windows" }],
			[
				{ lottery_name: "3 May, first test run", status: "open" },
				{ lottery_name: "test", status: "drawn" },
			],
		]);
		const name = await getCurrentLotteryName(pool as never);
		expect(name).toBe("3 May, first test run");
	});

	test("returns the open lottery when a cancelled lottery sorts later alphabetically", async () => {
		const { getCurrentLotteryName } = await import(
			"../../src/web/routes/utils.ts"
		);
		const pool = makeMockPool([
			[{ name: "lottery_windows" }],
			[
				{ lottery_name: "April Lottery", status: "open" },
				{ lottery_name: "z-last-alphabetically", status: "cancelled" },
			],
		]);
		const name = await getCurrentLotteryName(pool as never);
		expect(name).toBe("April Lottery");
	});

	test("falls back to most recent non-open lottery when none is open", async () => {
		const { getCurrentLotteryName } = await import(
			"../../src/web/routes/utils.ts"
		);
		const pool = makeMockPool([
			[{ name: "lottery_windows" }],
			[
				{ lottery_name: "2026-05", status: "cancelled" },
				{ lottery_name: "2026-03", status: "drawn" },
			],
		]);
		const name = await getCurrentLotteryName(pool as never);
		expect(name).toBe("2026-05");
	});

	test("db error falls back to default name", async () => {
		const { getCurrentLotteryName, defaultLotteryName } = await import(
			"../../src/web/routes/utils.ts"
		);
		const name = await getCurrentLotteryName(null as never);
		expect(name).toBe(defaultLotteryName());
	});
});
