import { describe, expect, test } from "bun:test";
import { IllegalStateError } from "@event-driven-io/emmett";
import {
	decide,
	evolve,
	initialState,
} from "../../src/domain/lottery/decider.ts";
import type {
	CloseApplicationWindow,
	DrawLottery,
	LotteryApplicant,
	LotteryState,
	OpenApplicationWindow,
} from "../../src/domain/lottery/types.ts";

function makePool(n: number): LotteryApplicant[] {
	return Array.from({ length: n }, (_, i) => ({
		applicationId: `app-${i + 1}`,
		applicantId: `applicant-${i + 1}`,
	}));
}

function openCommand(monthCycle = "2026-03"): OpenApplicationWindow {
	return {
		type: "OpenApplicationWindow",
		data: {
			monthCycle,
			openedAt: "2026-03-01T00:00:00Z",
			expectedClosingAt: "2026-03-31T23:59:59Z",
		},
	};
}

function closeCommand(monthCycle = "2026-03"): CloseApplicationWindow {
	return {
		type: "CloseApplicationWindow",
		data: { monthCycle, closedAt: "2026-03-31T23:59:59Z" },
	};
}

function drawCommand(
	overrides: Partial<DrawLottery["data"]> = {},
): DrawLottery {
	return {
		type: "DrawLottery",
		data: {
			monthCycle: "2026-03",
			volunteerId: "vol-1",
			availableBalance: 200,
			reserve: 0,
			grantAmount: 40,
			applicantPool: makePool(10),
			seed: "test-seed",
			drawnAt: "2026-04-01T10:00:00Z",
			...overrides,
		},
	};
}

describe("lottery decider", () => {
	describe("OpenApplicationWindow", () => {
		test("initial → ApplicationWindowOpened", () => {
			const events = decide(openCommand(), initialState());
			expect(events).toHaveLength(1);
			expect(events[0]!.type).toBe("ApplicationWindowOpened");
			expect(events[0]!.data.monthCycle).toBe("2026-03");
		});

		test("cannot open already-open window", () => {
			const state = evolve(initialState(), {
				type: "ApplicationWindowOpened",
				data: {
					monthCycle: "2026-03",
					openedAt: "2026-03-01T00:00:00Z",
					expectedClosingAt: "2026-03-31T23:59:59Z",
				},
			});
			expect(() => decide(openCommand(), state)).toThrow(IllegalStateError);
		});
	});

	describe("CloseApplicationWindow", () => {
		test("open → ApplicationWindowClosed", () => {
			const state = evolve(initialState(), {
				type: "ApplicationWindowOpened",
				data: {
					monthCycle: "2026-03",
					openedAt: "2026-03-01T00:00:00Z",
					expectedClosingAt: "2026-03-31T23:59:59Z",
				},
			});
			const events = decide(closeCommand(), state);
			expect(events).toHaveLength(1);
			expect(events[0]!.type).toBe("ApplicationWindowClosed");
			expect(events[0]!.data.monthCycle).toBe("2026-03");
		});

		test("cannot close from initial state", () => {
			expect(() => decide(closeCommand(), initialState())).toThrow(
				IllegalStateError,
			);
		});

		test("cannot close already-closed window", () => {
			let state = evolve(initialState(), {
				type: "ApplicationWindowOpened",
				data: {
					monthCycle: "2026-03",
					openedAt: "2026-03-01T00:00:00Z",
					expectedClosingAt: "2026-03-31T23:59:59Z",
				},
			});
			state = evolve(state, {
				type: "ApplicationWindowClosed",
				data: { monthCycle: "2026-03", closedAt: "2026-03-31T23:59:59Z" },
			});
			expect(() => decide(closeCommand(), state)).toThrow(IllegalStateError);
		});
	});

	describe("DrawLottery", () => {
		test("cannot draw from initial state", () => {
			expect(() => decide(drawCommand(), initialState())).toThrow(
				IllegalStateError,
			);
		});

		test("windowClosed → LotteryDrawn with correct slot count", () => {
			const state: LotteryState = {
				status: "windowClosed",
				monthCycle: "2026-03",
			};
			const events = decide(drawCommand(), state);
			expect(events).toHaveLength(1);
			expect(events[0]!.type).toBe("LotteryDrawn");
			expect(events[0]!.data.slots).toBe(5);
			expect(events[0]!.data.selected).toHaveLength(5);
			expect(events[0]!.data.notSelected).toHaveLength(5);
		});

		test("selected entries have rank 1..N", () => {
			const state: LotteryState = {
				status: "windowClosed",
				monthCycle: "2026-03",
			};
			const events = decide(drawCommand(), state);
			const ranks = events[0]!.data.selected.map(
				(s: { rank: number }) => s.rank,
			);
			expect(ranks).toEqual([1, 2, 3, 4, 5]);
		});

		test("slots capped by pool size", () => {
			const state: LotteryState = {
				status: "windowClosed",
				monthCycle: "2026-03",
			};
			const events = decide(
				drawCommand({
					availableBalance: 1000,
					applicantPool: makePool(3),
				}),
				state,
			);
			expect(events[0]!.data.selected).toHaveLength(3);
			expect(events[0]!.data.notSelected).toHaveLength(0);
			expect(events[0]!.data.slots).toBe(3);
		});

		test("reserve reduces available slots", () => {
			const state: LotteryState = {
				status: "windowClosed",
				monthCycle: "2026-03",
			};
			const events = decide(
				drawCommand({ availableBalance: 200, reserve: 80 }),
				state,
			);
			expect(events[0]!.data.slots).toBe(3);
			expect(events[0]!.data.selected).toHaveLength(3);
		});

		test("zero slots when balance <= reserve", () => {
			const state: LotteryState = {
				status: "windowClosed",
				monthCycle: "2026-03",
			};
			const events = decide(
				drawCommand({ availableBalance: 50, reserve: 50 }),
				state,
			);
			expect(events[0]!.data.slots).toBe(0);
			expect(events[0]!.data.selected).toHaveLength(0);
			expect(events[0]!.data.notSelected).toHaveLength(10);
		});

		test("empty pool → LotteryDrawn with no selections", () => {
			const state: LotteryState = {
				status: "windowClosed",
				monthCycle: "2026-03",
			};
			const events = decide(drawCommand({ applicantPool: [] }), state);
			expect(events[0]!.data.selected).toHaveLength(0);
			expect(events[0]!.data.notSelected).toHaveLength(0);
		});

		test("cannot draw twice", () => {
			const closed: LotteryState = {
				status: "windowClosed",
				monthCycle: "2026-03",
			};
			const events = decide(drawCommand(), closed);
			const drawn = evolve(closed, events[0]!);
			expect(() => decide(drawCommand(), drawn)).toThrow(IllegalStateError);
		});

		test("draw is deterministic for same seed", () => {
			const state: LotteryState = {
				status: "windowClosed",
				monthCycle: "2026-03",
			};
			const cmd = drawCommand();
			const events1 = decide(cmd, state);
			const events2 = decide(cmd, state);
			expect(events1[0]!.data.selected).toEqual(events2[0]!.data.selected);
		});
	});

	describe("evolve", () => {
		test("ApplicationWindowOpened → open", () => {
			const state = evolve(initialState(), {
				type: "ApplicationWindowOpened",
				data: {
					monthCycle: "2026-03",
					openedAt: "2026-03-01T00:00:00Z",
					expectedClosingAt: "2026-03-31T23:59:59Z",
				},
			});
			expect(state).toEqual({
				status: "open",
				monthCycle: "2026-03",
				expectedClosingAt: "2026-03-31T23:59:59Z",
			});
		});

		test("ApplicationWindowClosed → windowClosed", () => {
			const state = evolve(initialState(), {
				type: "ApplicationWindowClosed",
				data: { monthCycle: "2026-03", closedAt: "2026-03-31T23:59:59Z" },
			});
			expect(state).toEqual({
				status: "windowClosed",
				monthCycle: "2026-03",
			});
		});

		test("LotteryDrawn → drawn with selections", () => {
			const state = evolve(
				{ status: "windowClosed", monthCycle: "2026-03" },
				{
					type: "LotteryDrawn",
					data: {
						monthCycle: "2026-03",
						volunteerId: "vol-1",
						seed: "s",
						slots: 1,
						availableBalance: 40,
						reserve: 0,
						grantAmount: 40,
						selected: [{ applicationId: "app-1", applicantId: "a-1", rank: 1 }],
						notSelected: [{ applicationId: "app-2", applicantId: "a-2" }],
						drawnAt: "2026-04-01T10:00:00Z",
					},
				},
			);
			expect(state.status).toBe("drawn");
		});
	});
});
