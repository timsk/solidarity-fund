import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { CommandHandler } from "@event-driven-io/emmett";
import { toApplicantId } from "../../../src/domain/application/applicantId.ts";
import { checkEligibility } from "../../../src/domain/application/checkEligibility.ts";
import type { ApplicationEvent } from "../../../src/domain/application/types.ts";
import {
	decide as lotteryDecide,
	evolve as lotteryEvolve,
	initialState as lotteryInitialState,
} from "../../../src/domain/lottery/decider.ts";
import type { LotteryEvent } from "../../../src/domain/lottery/types.ts";
import { createTestEnv, type TestEnv } from "../helpers/testEventStore.ts";
import {
	cancelLotteryWindow,
	closeWindow,
	drawLottery,
	openWindow,
	processDrawResults,
	queryApplications,
	submitAcceptedApplication,
} from "../helpers/workflowSteps.ts";

process.env.COOLDOWN_DAYS ??= "90";

describe("lottery workflow", () => {
	let env: TestEnv;

	beforeEach(async () => {
		env = await createTestEnv();
	});

	afterEach(async () => {
		await env.cleanup();
	});

	test("full flow: 5 applicants → open → close → draw → 3 selected + 2 not_selected", async () => {
		const applicants = [
			{ id: "app-1", phone: "07700900001", name: "Alice" },
			{ id: "app-2", phone: "07700900002", name: "Bob" },
			{ id: "app-3", phone: "07700900003", name: "Charlie" },
			{ id: "app-4", phone: "07700900004", name: "Diana" },
			{ id: "app-5", phone: "07700900005", name: "Eve" },
		];

		for (const a of applicants) {
			await submitAcceptedApplication(env, {
				applicationId: a.id,
				phone: a.phone,
				name: a.name,
				lotteryName: "2026-03",
			});
		}

		await openWindow(env, "2026-03");
		await closeWindow(env, "2026-03");

		const pool = await env.pool.withConnection(async (conn) =>
			conn.query<{ id: string; applicant_id: string }>(
				"SELECT id, applicant_id FROM applications WHERE lottery_name = ? AND status = 'accepted'",
				["2026-03"],
			),
		);

		// balance=120, grant=40 → 3 winners
		const drawn = await drawLottery(env, {
			lotteryName: "2026-03",
			applicantPool: pool.map((a) => ({
				applicationId: a.id,
				applicantId: a.applicant_id,
			})),
			availableBalance: 120,
			grantAmount: 40,
		});

		expect(drawn.type).toBe("LotteryDrawn");
		expect(drawn.data.selected).toHaveLength(3);
		expect(drawn.data.notSelected).toHaveLength(2);

		await processDrawResults(env, drawn);

		// Verify selected
		for (const s of drawn.data.selected) {
			const { events } = await env.eventStore.readStream<ApplicationEvent>(
				`application-${s.applicationId}`,
			);
			const selected = events.find((e) => e.type === "ApplicationSelected");
			expect(selected).toBeDefined();
			expect(selected!.data.rank).toBe(s.rank);
		}

		// Verify not selected
		for (const ns of drawn.data.notSelected) {
			const { events } = await env.eventStore.readStream<ApplicationEvent>(
				`application-${ns.applicationId}`,
			);
			expect(
				events.find((e) => e.type === "ApplicationNotSelected"),
			).toBeDefined();
		}

		// Projection: statuses updated
		const apps = await queryApplications(env);
		const selectedApps = apps.filter((a) => a.status === "selected");
		const notSelectedApps = apps.filter((a) => a.status === "not_selected");
		expect(selectedApps).toHaveLength(3);
		expect(notSelectedApps).toHaveLength(2);
		for (const s of selectedApps) {
			expect(s.rank).toBeGreaterThan(0);
			expect(s.selected_at).toBeTruthy();
		}
	});

	test("confirmed applications are included in lottery pool", async () => {
		// Submit one accepted app normally
		await submitAcceptedApplication(env, {
			applicationId: "app-accepted",
			phone: "07700900001",
			name: "Alice",
			lotteryName: "2026-03",
		});

		// Create a confirmed app by emitting events directly (flagged → confirmed)
		const confirmedApplicantId = toApplicantId("07700900099", "Zara");
		await env.eventStore.appendToStream("application-app-confirmed", [
			{
				type: "ApplicationSubmitted",
				data: {
					applicationId: "app-confirmed",
					applicantId: confirmedApplicantId,
					identity: { phone: "07700900099", name: "Zara" },
					paymentPreference: "bank",
					meetingDetails: { place: "Mill Road" },
					lotteryName: "2026-03",
					submittedAt: "2026-03-01T00:00:00Z",
				},
			},
			{
				type: "ApplicationFlaggedForReview",
				data: {
					applicationId: "app-confirmed",
					applicantId: confirmedApplicantId,
					reason: "multiple-matches",
					lotteryName: "2026-03",
					flaggedAt: "2026-03-01T00:00:01Z",
				},
			},
			{
				type: "ApplicationConfirmed",
				data: {
					applicationId: "app-confirmed",
					applicantId: confirmedApplicantId,
					volunteerId: "vol-1",
					lotteryName: "2026-03",
					confirmedAt: "2026-03-02T00:00:00Z",
				},
			},
		]);

		await openWindow(env, "2026-03");
		await closeWindow(env, "2026-03");

		// Query both accepted and confirmed apps
		const apps = await queryApplications(env);
		const accepted = apps.filter((a) => a.status === "accepted");
		const confirmed = apps.filter((a) => a.status === "confirmed");
		expect(accepted).toHaveLength(1);
		expect(confirmed).toHaveLength(1);

		// Draw with both in the pool (mimicking the fixed filter logic)
		const pool = apps
			.filter((a) => a.status === "accepted" || a.status === "confirmed")
			.map((a) => ({
				applicationId: a.id,
				applicantId: a.applicant_id,
			}));
		expect(pool).toHaveLength(2);

		const drawn = await drawLottery(env, {
			lotteryName: "2026-03",
			applicantPool: pool,
			availableBalance: 80,
			grantAmount: 40,
		});

		expect(drawn.data.selected).toHaveLength(2);
		expect(drawn.data.notSelected).toHaveLength(0);
	});

	test("process manager is idempotent", async () => {
		await submitAcceptedApplication(env, {
			applicationId: "app-1",
			phone: "07700900001",
			name: "Alice",
			lotteryName: "2026-03",
		});

		await openWindow(env, "2026-03");
		await closeWindow(env, "2026-03");

		const drawn = await drawLottery(env, {
			lotteryName: "2026-03",
			applicantPool: [
				{
					applicationId: "app-1",
					applicantId: toApplicantId("07700900001", "Alice"),
				},
			],
			seed: "test-seed",
		});

		await processDrawResults(env, drawn);
		await processDrawResults(env, drawn);

		const { events } =
			await env.eventStore.readStream<ApplicationEvent>("application-app-1");
		expect(events.filter((e) => e.type === "ApplicationSelected")).toHaveLength(
			1,
		);
	});

	test("selected applicant triggers cooldown next month", async () => {
		await submitAcceptedApplication(env, {
			applicationId: "app-1",
			phone: "07700900001",
			name: "Alice",
			lotteryName: "2026-03",
		});

		await openWindow(env, "2026-03");
		await closeWindow(env, "2026-03");

		const drawn = await drawLottery(env, {
			lotteryName: "2026-03",
			applicantPool: [
				{
					applicationId: "app-1",
					applicantId: toApplicantId("07700900001", "Alice"),
				},
			],
			seed: "test-seed",
		});

		await processDrawResults(env, drawn);

		await env.eventStore.appendToStream("lottery-2026-04", [
			{
				type: "ApplicationWindowOpened",
				data: { lotteryName: "2026-04", openedAt: "2026-04-01T00:00:00Z" },
			},
		]);

		const result = await checkEligibility(
			toApplicantId("07700900001", "Alice"),
			"Alice",
			undefined,
			"2026-04",
			env.pool,
		);
		expect(result).toEqual({
			status: "cooldown",
			lastGrantSelectedAt: "2026-03-01T10:00:00Z",
			eligibleAfter: "2026-05-30T10:00:00.000Z",
			cooldownDays: 90,
		});
	});

	test("not_selected projection status", async () => {
		await submitAcceptedApplication(env, {
			applicationId: "app-1",
			phone: "07700900001",
			name: "Alice",
			lotteryName: "2026-03",
		});

		await env.eventStore.appendToStream("application-app-1", [
			{
				type: "ApplicationNotSelected",
				data: {
					applicationId: "app-1",
					applicantId: toApplicantId("07700900001", "Alice"),
					lotteryName: "2026-03",
					notSelectedAt: "2026-04-01T10:00:00Z",
				},
			},
		]);

		const apps = await queryApplications(env);
		expect(apps[0]!.status).toBe("not_selected");
	});

	test("auto-closes expired lottery on next request check", async () => {
		// Open an already-expired lottery (dates in 2020 ensure it's past)
		const handle = CommandHandler<
			ReturnType<typeof lotteryInitialState>,
			LotteryEvent
		>({
			evolve: lotteryEvolve,
			initialState: lotteryInitialState,
		});

		await handle(env.eventStore, "lottery-auto-close-test", (state) =>
			lotteryDecide(
				{
					type: "OpenApplicationWindow",
					data: {
						lotteryName: "auto-close-test",
						openedAt: "2020-01-01T00:00:00Z",
						expectedClosingAt: "2020-01-01T00:00:01Z",
					},
				},
				state,
			),
		);

		const before = await env.pool.withConnection(async (conn) =>
			conn.query<{ status: string }>(
				"SELECT status FROM lottery_windows WHERE lottery_name = ? LIMIT 1",
				["auto-close-test"],
			),
		);
		expect(before[0]?.status).toBe("open");

		const { autoCloseExpiredLottery } = await import(
			"../../../src/web/routes/utils.ts"
		);
		const closed = await autoCloseExpiredLottery(env.pool, env.eventStore);
		expect(closed).toBe(true);

		const after = await env.pool.withConnection(async (conn) =>
			conn.query<{ status: string }>(
				"SELECT status FROM lottery_windows WHERE lottery_name = ? LIMIT 1",
				["auto-close-test"],
			),
		);
		expect(after[0]?.status).toBe("closed");
	});

	test("cancel active lottery clears all accepted/confirmed applications", async () => {
		const applicants = [
			{ id: "app-1", phone: "07700900001", name: "Alice" },
			{ id: "app-2", phone: "07700900002", name: "Bob" },
			{ id: "app-3", phone: "07700900003", name: "Charlie" },
		];

		for (const a of applicants) {
			await submitAcceptedApplication(env, {
				applicationId: a.id,
				phone: a.phone,
				name: a.name,
				lotteryName: "2026-03",
			});
		}

		await openWindow(env, "2026-03");

		await cancelLotteryWindow(env, "2026-03", ["app-1", "app-2", "app-3"]);

		const windows = await env.pool.withConnection(async (conn) =>
			conn.query<{ status: string }>(
				"SELECT status FROM lottery_windows WHERE lottery_name = ?",
				["2026-03"],
			),
		);
		expect(windows[0]?.status).toBe("cancelled");

		const apps = await queryApplications(env);
		const cancelledApps = apps.filter((a) => a.status === "cancelled");
		expect(cancelledApps).toHaveLength(3);
		for (const app of cancelledApps) {
			expect(app.rank).toBeNull();
			expect(app.selected_at).toBeNull();
		}
	});

	test("cancel closed-but-not-drawn lottery", async () => {
		const applicants = [
			{ id: "app-1", phone: "07700900001", name: "Alice" },
			{ id: "app-2", phone: "07700900002", name: "Bob" },
		];

		for (const a of applicants) {
			await submitAcceptedApplication(env, {
				applicationId: a.id,
				phone: a.phone,
				name: a.name,
				lotteryName: "2026-04",
			});
		}

		await openWindow(env, "2026-04");
		await closeWindow(env, "2026-04");

		await cancelLotteryWindow(env, "2026-04", ["app-1", "app-2"]);

		const windows = await env.pool.withConnection(async (conn) =>
			conn.query<{ status: string }>(
				"SELECT status FROM lottery_windows WHERE lottery_name = ?",
				["2026-04"],
			),
		);
		expect(windows[0]?.status).toBe("cancelled");

		const apps = await queryApplications(env);
		const cancelledApps = apps.filter((a) => a.status === "cancelled");
		expect(cancelledApps).toHaveLength(2);
		for (const app of cancelledApps) {
			expect(app.rank).toBeNull();
			expect(app.selected_at).toBeNull();
		}
	});
});
