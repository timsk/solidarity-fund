import { CommandHandler, IllegalStateError } from "@event-driven-io/emmett";
import type {
	SQLiteConnectionPool,
	SQLiteEventStore,
} from "@event-driven-io/emmett-sqlite";
import {
	decide as appDecide,
	evolve as appEvolve,
	initialState as appInitialState,
} from "../application/decider.ts";
import type {
	ApplicationEvent,
	ApplicationSelected,
} from "../application/types.ts";
import type { LotteryDrawn } from "../lottery/types.ts";
import { decide, evolve, initialState } from "./decider.ts";
import type { GrantEvent, SlotReleased } from "./types.ts";

const handle = CommandHandler<ReturnType<typeof initialState>, GrantEvent>({
	evolve,
	initialState,
});

const appHandle = CommandHandler<
	ReturnType<typeof appInitialState>,
	ApplicationEvent
>({ evolve: appEvolve, initialState: appInitialState });

export async function processApplicationSelected(
	event: ApplicationSelected,
	eventStore: SQLiteEventStore,
	pool: ReturnType<typeof SQLiteConnectionPool>,
): Promise<void> {
	const { applicationId, applicantId, lotteryName, rank, selectedAt } =
		event.data;

	const rows = await pool.withConnection(async (conn) =>
		conn.query<{
			payment_preference: string;
			sort_code: string | null;
			account_number: string | null;
			poa_ref: string | null;
		}>(
			"SELECT payment_preference, sort_code, account_number, poa_ref FROM applications WHERE id = ?",
			[applicationId],
		),
	);

	if (!rows[0]) {
		throw new Error(`Application ${applicationId} not found in projection`);
	}
	const pref = rows[0].payment_preference;
	if (pref !== "bank" && pref !== "cash") {
		throw new Error(`Invalid payment_preference: ${pref}`);
	}
	const paymentPreference = pref;

	const { sort_code, account_number, poa_ref } = rows[0];
	const bankDetails =
		sort_code && account_number && poa_ref
			? {
					sortCode: sort_code,
					accountNumber: account_number,
					proofOfAddressRef: poa_ref,
				}
			: undefined;

	const streamId = `grant-${applicationId}`;
	try {
		await handle(eventStore, streamId, (state) =>
			decide(
				{
					type: "CreateGrant",
					data: {
						grantId: applicationId,
						applicationId,
						applicantId,
						lotteryName,
						rank,
						paymentPreference,
						createdAt: selectedAt,
						bankDetails,
					},
				},
				state,
			),
		);
	} catch (e) {
		if (!(e instanceof IllegalStateError)) throw e;
	}
}

export async function processSlotReleased(
	event: SlotReleased,
	eventStore: SQLiteEventStore,
	pool: ReturnType<typeof SQLiteConnectionPool>,
): Promise<void> {
	const { lotteryName } = event.data;

	const lotteryStream = await eventStore.readStream(`lottery-${lotteryName}`);
	if (!lotteryStream.streamExists) return;

	const drawnEvent = lotteryStream.events.findLast(
		(e) => e.type === "LotteryDrawn",
	) as LotteryDrawn | undefined;
	if (!drawnEvent) return;

	const { notSelected, selected } = drawnEvent.data;
	if (notSelected.length === 0) return;

	for (let i = 0; i < notSelected.length; i++) {
		const candidate = notSelected[i];
		const appStream = await eventStore.readStream(
			`application-${candidate.applicationId}`,
		);
		if (!appStream.streamExists) continue;

		const alreadySelected = appStream.events.find(
			(e) => e.type === "ApplicationSelected",
		);
		if (alreadySelected) continue;

		const rank = selected.length + i + 1;
		const selectedAt = new Date().toISOString();

		const appStreamId = `application-${candidate.applicationId}`;
		try {
			await appHandle(eventStore, appStreamId, (state) =>
				appDecide(
					{
						type: "SelectApplication",
						data: {
							applicationId: candidate.applicationId,
							lotteryName,
							rank,
							selectedAt,
						},
					},
					state,
				),
			);

			const updatedAppStream = await eventStore.readStream(
				`application-${candidate.applicationId}`,
			);
			const selectedEvent = updatedAppStream.events.find(
				(e) => e.type === "ApplicationSelected",
			) as ApplicationSelected | undefined;
			if (selectedEvent) {
				await processApplicationSelected(selectedEvent, eventStore, pool);
			}

			return;
		} catch (e) {
			if (!(e instanceof IllegalStateError)) throw e;
		}
	}
}
