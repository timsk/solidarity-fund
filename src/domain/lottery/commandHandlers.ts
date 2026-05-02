import type { EventStore } from "@event-driven-io/emmett";
import { CommandHandler } from "@event-driven-io/emmett";
import { decide, evolve, initialState } from "./decider.ts";
import type { LotteryApplicant, LotteryEvent } from "./types.ts";

const handle = CommandHandler<ReturnType<typeof initialState>, LotteryEvent>({
	evolve,
	initialState,
});

function streamId(lotteryName: string): string {
	return `lottery-${lotteryName}`;
}

export async function openApplicationWindow(
	lotteryName: string,
	expectedClosingAt: string,
	eventStore: EventStore,
): Promise<void> {
	const now = new Date().toISOString();
	await handle(eventStore, streamId(lotteryName), (state) =>
		decide(
			{
				type: "OpenApplicationWindow",
				data: { lotteryName, openedAt: now, expectedClosingAt },
			},
			state,
		),
	);
}

export async function closeApplicationWindow(
	lotteryName: string,
	eventStore: EventStore,
): Promise<void> {
	const now = new Date().toISOString();
	await handle(eventStore, streamId(lotteryName), (state) =>
		decide(
			{
				type: "CloseApplicationWindow",
				data: { lotteryName, closedAt: now },
			},
			state,
		),
	);
}

export async function cancelLottery(
	lotteryName: string,
	eventStore: EventStore,
): Promise<void> {
	const now = new Date().toISOString();
	await handle(eventStore, streamId(lotteryName), (state) =>
		decide(
			{
				type: "CancelLottery",
				data: { lotteryName, cancelledAt: now },
			},
			state,
		),
	);
}

export async function drawLottery(
	lotteryName: string,
	volunteerId: string,
	availableBalance: number,
	reserve: number,
	grantAmount: number,
	applicantPool: LotteryApplicant[],
	eventStore: EventStore,
): Promise<void> {
	const now = new Date().toISOString();
	const seed = crypto.randomUUID();
	await handle(eventStore, streamId(lotteryName), (state) =>
		decide(
			{
				type: "DrawLottery",
				data: {
					lotteryName,
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
