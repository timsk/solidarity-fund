import { IllegalStateError } from "@event-driven-io/emmett";
import { seededShuffle } from "./seededShuffle.ts";
import type {
	CancelLottery,
	CloseApplicationWindow,
	DrawLottery,
	LotteryCommand,
	LotteryEvent,
	LotteryState,
	OpenApplicationWindow,
} from "./types.ts";

export const initialState = (): LotteryState => ({ status: "initial" });

export function decide(
	command: LotteryCommand,
	state: LotteryState,
): LotteryEvent[] {
	switch (command.type) {
		case "OpenApplicationWindow":
			return decideOpen(command, state);
		case "CloseApplicationWindow":
			return decideClose(command, state);
		case "CancelLottery":
			return decideCancel(command, state);
		case "DrawLottery":
			return decideDraw(command, state);
	}
}

function decideOpen(
	command: OpenApplicationWindow,
	state: LotteryState,
): LotteryEvent[] {
	if (state.status !== "initial") {
		throw new IllegalStateError(`Cannot open window in ${state.status} state`);
	}
	return [
		{
			type: "ApplicationWindowOpened",
			data: {
				monthCycle: command.data.monthCycle,
				openedAt: command.data.openedAt,
				expectedClosingAt: command.data.expectedClosingAt,
			},
		},
	];
}

function decideClose(
	command: CloseApplicationWindow,
	state: LotteryState,
): LotteryEvent[] {
	if (state.status !== "open") {
		throw new IllegalStateError(`Cannot close window in ${state.status} state`);
	}
	return [
		{
			type: "ApplicationWindowClosed",
			data: {
				monthCycle: command.data.monthCycle,
				closedAt: command.data.closedAt,
			},
		},
	];
}

function decideCancel(
	command: CancelLottery,
	state: LotteryState,
): LotteryEvent[] {
	if (state.status !== "open" && state.status !== "windowClosed") {
		throw new IllegalStateError(
			`Cannot cancel lottery in ${state.status} state`,
		);
	}
	return [
		{
			type: "LotteryCancelled",
			data: {
				monthCycle: command.data.monthCycle,
				previousStatus: state.status,
				cancelledAt: command.data.cancelledAt,
			},
		},
	];
}

function decideDraw(command: DrawLottery, state: LotteryState): LotteryEvent[] {
	if (state.status !== "windowClosed") {
		throw new IllegalStateError(`Cannot draw lottery in ${state.status} state`);
	}

	const { data } = command;
	const maxSlots = Math.max(
		0,
		Math.floor((data.availableBalance - data.reserve) / data.grantAmount),
	);
	const slots = Math.min(maxSlots, data.applicantPool.length);

	const shuffled = seededShuffle(data.applicantPool, data.seed);
	const selected = shuffled.slice(0, slots).map((a, i) => ({
		...a,
		rank: i + 1,
	}));
	const notSelected = shuffled.slice(slots);

	return [
		{
			type: "LotteryDrawn",
			data: {
				monthCycle: data.monthCycle,
				volunteerId: data.volunteerId,
				seed: data.seed,
				slots,
				availableBalance: data.availableBalance,
				reserve: data.reserve,
				grantAmount: data.grantAmount,
				selected,
				notSelected,
				drawnAt: data.drawnAt,
			},
		},
	];
}

export function evolve(state: LotteryState, event: LotteryEvent): LotteryState {
	switch (event.type) {
		case "ApplicationWindowOpened":
			return {
				status: "open",
				monthCycle: event.data.monthCycle,
				expectedClosingAt: event.data.expectedClosingAt,
			};
		case "ApplicationWindowClosed":
			return {
				status: "windowClosed",
				monthCycle: event.data.monthCycle,
			};
		case "LotteryCancelled":
			return {
				status: "cancelled",
				monthCycle: event.data.monthCycle,
			};
		case "LotteryDrawn":
			return {
				status: "drawn",
				monthCycle: event.data.monthCycle,
				selected: event.data.selected,
				notSelected: event.data.notSelected,
			};
		default: {
			const _exhaustive: never = event;
			return state;
		}
	}
}
