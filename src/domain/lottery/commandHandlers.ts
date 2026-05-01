import type { EventStore } from "@event-driven-io/emmett";
import { CommandHandler } from "@event-driven-io/emmett";
import { decide, evolve, initialState } from "./decider.ts";
import type { LotteryApplicant, LotteryEvent } from "./types.ts";

const handle = CommandHandler<ReturnType<typeof initialState>, LotteryEvent>({
	evolve,
	initialState,
});

function streamId(monthCycle: string): string {
	return `lottery-${monthCycle}`;
}

export async function openApplicationWindow(
	monthCycle: string,
	expectedClosingAt: string,
	eventStore: EventStore,
): Promise<void> {
	const now = new Date().toISOString();
	await handle(eventStore, streamId(monthCycle), (state) =>
		decide(
			{
				type: "OpenApplicationWindow",
				data: { monthCycle, openedAt: now, expectedClosingAt },
			},
			state,
		),
	);
}

export async function closeApplicationWindow(
	monthCycle: string,
	eventStore: EventStore,
): Promise<void> {
	const now = new Date().toISOString();
	await handle(eventStore, streamId(monthCycle), (state) =>
		decide(
			{
				type: "CloseApplicationWindow",
				data: { monthCycle, closedAt: now },
			},
			state,
		),
	);
}

export async function cancelLottery(
	monthCycle: string,
	eventStore: EventStore,
): Promise<void> {
	const now = new Date().toISOString();
	await handle(eventStore, streamId(monthCycle), (state) =>
		decide(
			{
				type: "CancelLottery",
				data: { monthCycle, cancelledAt: now },
			},
			state,
		),
	);
}

export async function drawLottery(
	monthCycle: string,
	volunteerId: string,
	availableBalance: number,
	reserve: number,
	grantAmount: number,
	applicantPool: LotteryApplicant[],
	eventStore: EventStore,
): Promise<void> {
	const now = new Date().toISOString();
	const seed = crypto.randomUUID();
	await handle(eventStore, streamId(monthCycle), (state) =>
		decide(
			{
				type: "DrawLottery",
				data: {
					monthCycle,
					volunteerId,
					availableBalance,
					reserve,
					grantAmount,
					applicantPool,
					seed,
					drawnAt: now,
				},
			},
			state,
		),
	);
}
