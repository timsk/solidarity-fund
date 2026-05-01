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
		monthCycle: string;
		openedAt: string;
		expectedClosingAt: string;
	}
>;

export type CloseApplicationWindow = Command<
	"CloseApplicationWindow",
	{
		monthCycle: string;
		closedAt: string;
	}
>;

export type DrawLottery = Command<
	"DrawLottery",
	{
		monthCycle: string;
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
	| DrawLottery;

// Events

export type ApplicationWindowOpened = Event<
	"ApplicationWindowOpened",
	{
		monthCycle: string;
		openedAt: string;
		expectedClosingAt: string;
	}
>;

export type ApplicationWindowClosed = Event<
	"ApplicationWindowClosed",
	{
		monthCycle: string;
		closedAt: string;
	}
>;

export type LotteryDrawn = Event<
	"LotteryDrawn",
	{
		monthCycle: string;
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
	| LotteryDrawn;

export type LotteryEventType = LotteryEvent["type"];

// State

export type LotteryState =
	| { status: "initial" }
	| { status: "open"; monthCycle: string; expectedClosingAt: string }
	| { status: "windowClosed"; monthCycle: string }
	| {
			status: "drawn";
			monthCycle: string;
			selected: LotterySelection[];
			notSelected: LotteryApplicant[];
	  };
