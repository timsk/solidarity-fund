import { CommandHandler, IllegalStateError } from "@event-driven-io/emmett";
import type { SQLiteEventStore } from "@event-driven-io/emmett-sqlite";
import { decide, evolve, initialState } from "../application/decider.ts";
import type {
	ApplicationEvent,
	CancelApplicationDueToLottery,
} from "../application/types.ts";
import type { LotteryCancelled, LotteryDrawn } from "./types.ts";

const handle = CommandHandler<
	ReturnType<typeof initialState>,
	ApplicationEvent
>({ evolve, initialState });

export async function processLotteryDrawn(
	event: LotteryDrawn,
	eventStore: SQLiteEventStore,
): Promise<void> {
	for (const selected of event.data.selected) {
		const streamId = `application-${selected.applicationId}`;
		try {
			await handle(eventStore, streamId, (state) =>
				decide(
					{
						type: "SelectApplication",
						data: {
							applicationId: selected.applicationId,
							lotteryName: event.data.lotteryName,
							rank: selected.rank,
							selectedAt: event.data.drawnAt,
						},
					},
					state,
				),
			);
		} catch (e) {
			if (!(e instanceof IllegalStateError)) throw e;
		}
	}

	for (const notSelected of event.data.notSelected) {
		const streamId = `application-${notSelected.applicationId}`;
		try {
			await handle(eventStore, streamId, (state) =>
				decide(
					{
						type: "RejectFromLottery",
						data: {
							applicationId: notSelected.applicationId,
							lotteryName: event.data.lotteryName,
							rejectedAt: event.data.drawnAt,
						},
					},
					state,
				),
			);
		} catch (e) {
			if (!(e instanceof IllegalStateError)) throw e;
		}
	}
}

export async function processLotteryCancelled(
	event: LotteryCancelled,
	eventStore: SQLiteEventStore,
	applicationIds: string[],
): Promise<void> {
	for (const applicationId of applicationIds) {
		const streamId = `application-${applicationId}`;
		try {
			await handle(eventStore, streamId, (state) =>
				decide(
					{
						type: "ApplicationLotteryCancelled",
						data: {
							applicationId,
							lotteryName: event.data.lotteryName,
							cancelledAt: event.data.cancelledAt,
						},
					} as unknown as CancelApplicationDueToLottery,
					state,
				),
			);
		} catch (e) {
			if (!(e instanceof IllegalStateError)) throw e;
		}
	}
}
