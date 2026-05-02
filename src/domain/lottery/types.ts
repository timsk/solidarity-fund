import type { Command, Event } from "@event-driven-io/emmett";

// Value Objects

export type LotteryApplicant = {
	applicationId: string;
	applicantId: string;
};

export type LotterySelection = LotteryApplicant & {
	rank: number;
};

// Commands

export type OpenApplicationWindow = Command<
	"OpenApplicationWindow",
	{
		lotteryName: string;
		openedAt: string;
		expectedClosingAt: string;
	}
>;

export type CloseApplicationWindow = Command<
	"CloseApplicationWindow",
	{
		lotteryName: string;
		closedAt: string;
	}
>;

export type CancelLottery = Command<
	"CancelLottery",
	{
		lotteryName: string;
		cancelledAt: string;
	}
>;

export type DrawLottery = Command<
	"DrawLottery",
	{
		lotteryName: string;
		volunteerId: string;
		availableBalance: number;
		reserve: number;
		grantAmount: number;
		applicantPool: LotteryApplicant[];
		seed: string;
		drawnAt: string;
	}
>;

export type LotteryCommand =
	| OpenApplicationWindow
	| CloseApplicationWindow
	| CancelLottery
	| DrawLottery;

// Events

export type ApplicationWindowOpened = Event<
	"ApplicationWindowOpened",
	{
		lotteryName: string;
		openedAt: string;
		expectedClosingAt: string;
	}
>;

export type ApplicationWindowClosed = Event<
	"ApplicationWindowClosed",
	{
		lotteryName: string;
		closedAt: string;
	}
>;

export type LotteryCancelled = Event<
	"LotteryCancelled",
	{
		lotteryName: string;
		previousStatus: string;
		cancelledAt: string;
	}
>;

export type LotteryDrawn = Event<
	"LotteryDrawn",
	{
		lotteryName: string;
		volunteerId: string;
		seed: string;
		slots: number;
		availableBalance: number;
		reserve: number;
		grantAmount: number;
		selected: LotterySelection[];
		notSelected: LotteryApplicant[];
		drawnAt: string;
	}
>;

export type LotteryEvent =
	| ApplicationWindowOpened
	| ApplicationWindowClosed
	| LotteryCancelled
	| LotteryDrawn;

type LotteryEventType = LotteryEvent["type"];

// State

export type LotteryState =
	| { status: "initial" }
	| { status: "open"; lotteryName: string; expectedClosingAt: string }
	| { status: "windowClosed"; lotteryName: string }
	| { status: "cancelled"; lotteryName: string }
	| {
			status: "drawn";
			lotteryName: string;
			selected: LotterySelection[];
			notSelected: LotteryApplicant[];
	  };
