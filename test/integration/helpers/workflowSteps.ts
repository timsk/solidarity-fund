import { expect } from "bun:test";
import { CommandHandler } from "@event-driven-io/emmett";
import { toApplicantId } from "../../../src/domain/application/applicantId.ts";
import { submitApplication } from "../../../src/domain/application/submitApplication.ts";
import type { ApplicationEvent } from "../../../src/domain/application/types.ts";
import { processApplicationSelected } from "../../../src/domain/grant/processManager.ts";
import { cancelLottery } from "../../../src/domain/lottery/commandHandlers.ts";
import {
	decide as lotteryDecide,
	evolve as lotteryEvolve,
	initialState as lotteryInitialState,
} from "../../../src/domain/lottery/decider.ts";
import {
	processLotteryCancelled,
	processLotteryDrawn,
} from "../../../src/domain/lottery/processManager.ts";
import type { LotteryEvent } from "../../../src/domain/lottery/types.ts";
import type { TestEnv } from "./testEventStore.ts";

export async function submitAcceptedApplication(
	env: TestEnv,
	opts: {
		applicationId: string;
		phone: string;
		name: string;
		paymentPreference?: "bank" | "cash";
		meetingPlace?: string;
		monthCycle?: string;
		bankDetails?: {
			sortCode: string;
			accountNumber: string;
			proofOfAddressRef: string;
		};
	},
) {
	return submitApplication(
		{
			applicationId: opts.applicationId,
			phone: opts.phone,
			name: opts.name,
			paymentPreference: opts.paymentPreference ?? "bank",
			meetingPlace: opts.meetingPlace ?? "Mill Road",
			monthCycle: opts.monthCycle ?? "2026-03",
			eligibility: { status: "eligible" },
			bankDetails: opts.bankDetails,
		},
		env.eventStore,
		env.applicantRepo,
	);
}

function createLotteryHandler() {
	return CommandHandler<ReturnType<typeof lotteryInitialState>, LotteryEvent>({
		evolve: lotteryEvolve,
		initialState: lotteryInitialState,
	});
}

export async function openWindow(env: TestEnv, monthCycle: string) {
	const handle = createLotteryHandler();
	await handle(env.eventStore, `lottery-${monthCycle}`, (state) =>
		lotteryDecide(
			{
				type: "OpenApplicationWindow",
				data: {
					monthCycle,
					openedAt: `${monthCycle}-01T00:00:00Z`,
					expectedClosingAt: `${monthCycle}-28T23:59:59Z`,
				},
			},
			state,
		),
	);
}

export async function closeWindow(env: TestEnv, monthCycle: string) {
	const handle = createLotteryHandler();
	await handle(env.eventStore, `lottery-${monthCycle}`, (state) =>
		lotteryDecide(
			{
				type: "CloseApplicationWindow",
				data: { monthCycle, closedAt: `${monthCycle}-28T23:59:59Z` },
			},
			state,
		),
	);
}

export async function drawLottery(
	env: TestEnv,
	opts: {
		monthCycle: string;
		applicantPool: { applicationId: string; applicantId: string }[];
		availableBalance?: number;
		reserve?: number;
		grantAmount?: number;
		seed?: string;
	},
) {
	const handle = createLotteryHandler();
	const { newEvents } = await handle(
		env.eventStore,
		`lottery-${opts.monthCycle}`,
		(state) =>
			lotteryDecide(
				{
					type: "DrawLottery",
					data: {
						monthCycle: opts.monthCycle,
						volunteerId: "vol-1",
						availableBalance: opts.availableBalance ?? 40,
						reserve: opts.reserve ?? 0,
						grantAmount: opts.grantAmount ?? 40,
						applicantPool: opts.applicantPool,
						seed: opts.seed ?? crypto.randomUUID(),
						drawnAt: `${opts.monthCycle}-01T10:00:00Z`,
					},
				},
				state,
			),
	);
	return newEvents[0]!;
}

export async function processDrawResults(
	env: TestEnv,
	drawnEvent: LotteryEvent,
) {
	await processLotteryDrawn(drawnEvent, env.eventStore);
}

export async function cancelLotteryWindow(
	env: TestEnv,
	monthCycle: string,
	applicationIds: string[],
) {
	await cancelLottery(monthCycle, env.eventStore);
	const { events } = await env.eventStore.readStream(`lottery-${monthCycle}`);
	const cancelled = events.find((e) => e.type === "LotteryCancelled");
	if (!cancelled) {
		throw new Error(
			`LotteryCancelled event not found for stream lottery-${monthCycle}`,
		);
	}
	await processLotteryCancelled(cancelled, env.eventStore, applicationIds);
}

export async function createGrantFromSelection(
	env: TestEnv,
	selectedEvent: ApplicationEvent,
) {
	await processApplicationSelected(selectedEvent, env.eventStore, env.pool);
}

/** Full pipeline: submit → open → close → draw → process → create grant */
export async function selectWinner(
	env: TestEnv,
	opts: {
		applicationId: string;
		phone: string;
		name: string;
		paymentPreference?: "bank" | "cash";
		monthCycle?: string;
		bankDetails?: {
			sortCode: string;
			accountNumber: string;
			proofOfAddressRef: string;
		};
	},
) {
	const monthCycle = opts.monthCycle ?? "2026-03";
	const appId = opts.applicationId;
	const paymentPreference = opts.paymentPreference ?? "bank";

	await submitAcceptedApplication(env, {
		...opts,
		paymentPreference,
		monthCycle,
		bankDetails: opts.bankDetails,
	});

	// Use a per-app lottery stream to avoid conflicts between tests
	const handle = createLotteryHandler();
	const lotteryStream = `lottery-${monthCycle}-${appId}`;
	const applicantId = toApplicantId(opts.phone, opts.name);

	await handle(env.eventStore, lotteryStream, (state) =>
		lotteryDecide(
			{
				type: "OpenApplicationWindow",
				data: {
					monthCycle,
					openedAt: `${monthCycle}-01T00:00:00Z`,
					expectedClosingAt: `${monthCycle}-28T23:59:59Z`,
				},
			},
			state,
		),
	);

	await handle(env.eventStore, lotteryStream, (state) =>
		lotteryDecide(
			{
				type: "CloseApplicationWindow",
				data: { monthCycle, closedAt: `${monthCycle}-28T23:59:59Z` },
			},
			state,
		),
	);

	const { newEvents } = await handle(env.eventStore, lotteryStream, (state) =>
		lotteryDecide(
			{
				type: "DrawLottery",
				data: {
					monthCycle,
					volunteerId: "vol-1",
					availableBalance: 40,
					reserve: 0,
					grantAmount: 40,
					applicantPool: [{ applicationId: appId, applicantId }],
					seed: `seed-${appId}`,
					drawnAt: `${monthCycle}-01T10:00:00Z`,
				},
			},
			state,
		),
	);

	const drawn = newEvents[0]!;
	await processLotteryDrawn(drawn, env.eventStore);

	const { events } = await env.eventStore.readStream<ApplicationEvent>(
		`application-${appId}`,
	);
	const selected = events.find((e) => e.type === "ApplicationSelected");
	expect(selected).toBeDefined();

	await processApplicationSelected(selected!, env.eventStore, env.pool);
}

export async function queryApplications(env: TestEnv) {
	return env.pool.withConnection(async (conn) =>
		conn.query<{
			id: string;
			applicant_id: string;
			month_cycle: string;
			status: string;
			rank: number | null;
			payment_preference: string;
			reject_reason: string | null;
			name: string;
			phone: string;
			applied_at: string | null;
			accepted_at: string | null;
			selected_at: string | null;
			rejected_at: string | null;
		}>("SELECT * FROM applications"),
	);
}

export async function queryGrant(env: TestEnv, id: string) {
	return env.pool.withConnection(async (conn) =>
		conn.query<{
			id: string;
			application_id: string;
			applicant_id: string;
			month_cycle: string;
			rank: number;
			status: string;
			payment_preference: string;
			sort_code: string | null;
			account_number: string | null;
			poa_ref: string | null;
			volunteer_id: string | null;
			poa_attempts: number;
			amount: number | null;
			payment_method: string | null;
			paid_by: string | null;
			paid_at: string | null;
			expense_reference: string | null;
			reimbursed_at: string | null;
			released_reason: string | null;
			released_at: string | null;
			created_at: string;
			updated_at: string;
		}>("SELECT * FROM grants WHERE id = ?", [id]),
	);
}
