import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { ApplicantEvent } from "../../../src/domain/applicant/types.ts";
import { toApplicantId } from "../../../src/domain/application/applicantId.ts";
import { checkEligibility } from "../../../src/domain/application/checkEligibility.ts";
import { reviewApplication } from "../../../src/domain/application/reviewApplication.ts";
import { submitApplication } from "../../../src/domain/application/submitApplication.ts";
import { createTestEnv, type TestEnv } from "../helpers/testEventStore.ts";
import {
	openWindow,
	queryApplications,
	submitAcceptedApplication,
} from "../helpers/workflowSteps.ts";

describe("application workflow", () => {
	let env: TestEnv;

	beforeEach(async () => {
		env = await createTestEnv();
	});

	afterEach(async () => {
		await env.cleanup();
	});

	describe("submit → accept", () => {
		test("new phone → Submitted + Accepted + creates applicant", async () => {
			const { events } = await submitAcceptedApplication(env, {
				applicationId: "app-1",
				phone: "07700900001",
				name: "Alice",
			});

			expect(events).toHaveLength(2);
			expect(events[0]!.type).toBe("ApplicationSubmitted");
			expect(events[1]!.type).toBe("ApplicationAccepted");
			expect(events[0]!.data.applicantId).toBe(
				toApplicantId("07700900001", "Alice"),
			);

			// Applicant created
			const applicant = await env.applicantRepo.getByPhoneAndName(
				"07700900001",
				"Alice",
			);
			expect(applicant).not.toBeNull();

			// ApplicantCreated event emitted
			const id = toApplicantId("07700900001", "Alice");
			const { events: applicantEvents } =
				await env.eventStore.readStream<ApplicantEvent>(`applicant-${id}`);
			expect(
				applicantEvents.find((e) => e.type === "ApplicantCreated"),
			).toBeDefined();

			// Projection: row exists with status accepted
			const apps = await queryApplications(env);
			expect(apps).toHaveLength(1);
			expect(apps[0]!.status).toBe("accepted");
			expect(apps[0]!.name).toBe("Alice");
			expect(apps[0]!.phone).toBe("07700900001");
			expect(apps[0]!.payment_preference).toBe("bank");
			expect(apps[0]!.accepted_at).toBeTruthy();
		});

		test("known phone + same name → reuses applicant, no duplicate", async () => {
			await submitAcceptedApplication(env, {
				applicationId: "app-first",
				phone: "07700900001",
				name: "Alice",
				lotteryName: "2026-03",
			});

			const { events } = await submitAcceptedApplication(env, {
				applicationId: "app-second",
				phone: "07700900001",
				name: "Alice",
				lotteryName: "2026-04",
			});

			expect(events[0]!.data.applicantId).toBe(
				toApplicantId("07700900001", "Alice"),
			);
			expect(events[1]!.type).toBe("ApplicationAccepted");

			// Only one ApplicantCreated
			const id = toApplicantId("07700900001", "Alice");
			const { events: applicantEvents } =
				await env.eventStore.readStream<ApplicantEvent>(`applicant-${id}`);
			expect(
				applicantEvents.filter((e) => e.type === "ApplicantCreated"),
			).toHaveLength(1);
		});

		test("idempotency — cannot submit twice with same applicationId", async () => {
			const form = {
				applicationId: "app-1",
				phone: "07700900001",
				name: "Alice",
				paymentPreference: "bank" as const,
				meetingPlace: "Mill Road",
				lotteryName: "2026-03",
				eligibility: { status: "eligible" as const },
			};

			await submitApplication(form, env.eventStore, env.applicantRepo);
			await expect(
				submitApplication(form, env.eventStore, env.applicantRepo),
			).rejects.toThrow(/already submitted/i);
		});
	});

	describe("submit → reject", () => {
		test("window closed → Submitted + Rejected", async () => {
			const { events } = await submitApplication(
				{
					applicationId: "app-1",
					phone: "07700900001",
					name: "Alice",
					paymentPreference: "bank",
					meetingPlace: "Mill Road",
					lotteryName: "2026-03",
					eligibility: { status: "window_closed" },
				},
				env.eventStore,
				env.applicantRepo,
			);

			expect(events[1]!.type).toBe("ApplicationRejected");
			expect(events[1]!.data).toMatchObject({
				reason: "window_closed",
			});

			// Projection: rejected
			const apps = await queryApplications(env);
			expect(apps[0]!.status).toBe("rejected");
			expect(apps[0]!.reject_reason).toBe("window_closed");
		});

		test("cooldown → Submitted + Rejected", async () => {
			const { events } = await submitApplication(
				{
					applicationId: "app-1",
					phone: "07700900001",
					name: "Alice",
					paymentPreference: "bank",
					meetingPlace: "Mill Road",
					lotteryName: "2026-03",
					eligibility: { status: "cooldown", lastGrantMonth: "2026-01" },
				},
				env.eventStore,
				env.applicantRepo,
			);

			expect(events[1]!.type).toBe("ApplicationRejected");
			expect(events[1]!.data).toMatchObject({
				reason: "cooldown",
				detail: "Last grant in 2026-01",
			});
		});

		test("duplicate → Submitted + Rejected", async () => {
			const { events } = await submitApplication(
				{
					applicationId: "app-1",
					phone: "07700900001",
					name: "Alice",
					paymentPreference: "bank",
					meetingPlace: "Mill Road",
					lotteryName: "2026-03",
					eligibility: { status: "duplicate" },
				},
				env.eventStore,
				env.applicantRepo,
			);

			expect(events[1]!.type).toBe("ApplicationRejected");
			expect(events[1]!.data).toMatchObject({ reason: "duplicate" });
		});

		test("rejected does not block reapplication", async () => {
			await openWindow(env, "2026-03");

			await submitApplication(
				{
					applicationId: "app-1",
					phone: "07700900001",
					name: "Alice",
					paymentPreference: "bank",
					meetingPlace: "Mill Road",
					lotteryName: "2026-03",
					eligibility: { status: "duplicate" },
				},
				env.eventStore,
				env.applicantRepo,
			);

			const eligibility = await checkEligibility(
				toApplicantId("07700900001", "Alice"),
				"Alice",
				undefined,
				"2026-03",
				env.pool,
			);
			expect(eligibility).toEqual({ status: "eligible" });
		});
	});

	describe("flagged flow", () => {
		async function submitFlagged() {
			await submitAcceptedApplication(env, {
				applicationId: "app-first",
				phone: "07700900001",
				name: "Alice",
				lotteryName: "2026-01",
			});

			const { events } = await submitApplication(
				{
					applicationId: "app-flagged",
					phone: "07700900001",
					name: "Bob",
					paymentPreference: "cash",
					meetingPlace: "Station",
					lotteryName: "2026-06",
					eligibility: { status: "eligible" },
				},
				env.eventStore,
				env.applicantRepo,
			);

			expect(events[1]!.type).toBe("ApplicationFlaggedForReview");
			return events;
		}

		test("phone mismatch → flagged", async () => {
			const events = await submitFlagged();
			expect(events[1]!.data).toMatchObject({
				applicantId: toApplicantId("07700900001", "Alice"),
				reason: "Phone matches but name differs",
			});
		});

		test("volunteer confirms eligible → ApplicationConfirmed with submitted applicant ID", async () => {
			await submitFlagged();
			await openWindow(env, "2026-06");

			const submittedApplicantId = toApplicantId("07700900001", "Bob");
			const eligibility = await checkEligibility(
				submittedApplicantId,
				"Alice",
				undefined,
				"2026-06",
				env.pool,
			);

			const { events } = await reviewApplication(
				"app-flagged",
				"vol-1",
				"confirm",
				eligibility,
				env.eventStore,
				submittedApplicantId,
			);

			expect(events[0]!.type).toBe("ApplicationConfirmed");
			expect(events[0]!.data).toMatchObject({
				volunteerId: "vol-1",
				applicantId: submittedApplicantId,
			});

			// Projection: accepted with Bob's applicant ID
			const apps = await queryApplications(env);
			const flagged = apps.find((a) => a.id === "app-flagged");
			expect(flagged!.status).toBe("confirmed");
			expect(flagged!.applicant_id).toBe(submittedApplicantId);
		});

		test("volunteer confirms when original applicant already applied same month → ApplicationConfirmed (not duplicate)", async () => {
			// Alice applied in the SAME month as Bob's flagged application
			await submitAcceptedApplication(env, {
				applicationId: "app-alice-same-month",
				phone: "07700900001",
				name: "Alice",
				lotteryName: "2026-06",
			});

			// Bob applies same phone, flagged (borrows Alice's applicant ID)
			const { events: flaggedEvents } = await submitApplication(
				{
					applicationId: "app-flagged",
					phone: "07700900001",
					name: "Bob",
					paymentPreference: "cash",
					meetingPlace: "Station",
					lotteryName: "2026-06",
					eligibility: { status: "eligible" },
				},
				env.eventStore,
				env.applicantRepo,
			);
			expect(flaggedEvents[1]!.type).toBe("ApplicationFlaggedForReview");

			await openWindow(env, "2026-06");

			// Eligibility check uses Bob's submitted identity — not Alice's
			const submittedApplicantId = toApplicantId("07700900001", "Bob");
			const eligibility = await checkEligibility(
				submittedApplicantId,
				"Alice",
				undefined,
				"2026-06",
				env.pool,
			);
			// Bob has no prior applications → eligible
			expect(eligibility.status).toBe("eligible");

			const { events } = await reviewApplication(
				"app-flagged",
				"vol-1",
				"confirm",
				eligibility,
				env.eventStore,
				submittedApplicantId,
			);

			expect(events[0]!.type).toBe("ApplicationConfirmed");

			const apps = await queryApplications(env);
			const confirmed = apps.find((a) => a.id === "app-flagged");
			expect(confirmed!.status).toBe("confirmed");
			expect(confirmed!.applicant_id).toBe(submittedApplicantId);
		});

		test("volunteer confirms flagged with different name → creates new applicant record", async () => {
			await submitFlagged();
			await openWindow(env, "2026-06");

			const submittedApplicantId = toApplicantId("07700900001", "Bob");
			const eligibility = await checkEligibility(
				submittedApplicantId,
				"Alice",
				undefined,
				"2026-06",
				env.pool,
			);

			await reviewApplication(
				"app-flagged",
				"vol-1",
				"confirm",
				eligibility,
				env.eventStore,
				submittedApplicantId,
			);

			const applicants = await env.applicantRepo.list();
			const bob = applicants.find((a) => a.id === submittedApplicantId);
			expect(bob).toBeDefined();
			expect(bob!.name).toBe("Bob");
			expect(bob!.phone).toBe("07700900001");
		});

		test("volunteer confirms but cooldown → ApplicationRejected", async () => {
			await submitFlagged();
			await openWindow(env, "2026-03");

			// Select first app so cooldown triggers
			await env.eventStore.appendToStream("application-app-first", [
				{
					type: "ApplicationSelected",
					data: {
						applicationId: "app-first",
						applicantId: toApplicantId("07700900001", "Alice"),
						lotteryName: "2026-01",
						rank: 1,
						selectedAt: new Date().toISOString(),
					},
				},
			]);

			const eligibility = await checkEligibility(
				toApplicantId("07700900001", "Alice"),
				"Alice",
				undefined,
				"2026-03",
				env.pool,
			);
			expect(eligibility.status).toBe("cooldown");

			const { events } = await reviewApplication(
				"app-flagged",
				"vol-1",
				"confirm",
				eligibility,
				env.eventStore,
			);

			expect(events[0]!.type).toBe("ApplicationRejected");
			expect(events[0]!.data).toMatchObject({
				reason: "cooldown",
				volunteerId: "vol-1",
			});
		});

		test("volunteer rejects → ApplicationRejected(identity_mismatch)", async () => {
			await submitFlagged();

			const { events } = await reviewApplication(
				"app-flagged",
				"vol-1",
				"reject",
				{ status: "eligible" },
				env.eventStore,
			);

			expect(events[0]!.type).toBe("ApplicationRejected");
			expect(events[0]!.data).toMatchObject({
				reason: "identity_mismatch",
				volunteerId: "vol-1",
			});
		});

		test("cannot review an already-confirmed application", async () => {
			await submitAcceptedApplication(env, {
				applicationId: "app-double-confirm",
				phone: "07700900100",
				name: "Alice",
			});
			await reviewApplication(
				"app-double-confirm",
				"vol-1",
				"confirm",
				{ status: "eligible" },
				env.eventStore,
			);

			await expect(
				reviewApplication(
					"app-double-confirm",
					"vol-2",
					"confirm",
					{ status: "eligible" },
					env.eventStore,
				),
			).rejects.toThrow(/cannot review/i);
		});

		test("can review accepted application", async () => {
			await submitAcceptedApplication(env, {
				applicationId: "app-review-accepted",
				phone: "07700900101",
				name: "Bob",
			});

			const result = await reviewApplication(
				"app-review-accepted",
				"vol-1",
				"confirm",
				{ status: "eligible" },
				env.eventStore,
			);

			expect(result.events).toHaveLength(1);
			expect(result.events[0]?.type).toBe("ApplicationConfirmed");
		});
	});

	describe("eligibility rules", () => {
		test("window not opened → window_closed", async () => {
			const eligibility = await checkEligibility(
				toApplicantId("07700900001", "Alice"),
				"Alice",
				undefined,
				"2026-03",
				env.pool,
			);
			expect(eligibility).toEqual({ status: "window_closed" });
		});

		test("window open → eligible", async () => {
			await openWindow(env, "2026-03");

			const eligibility = await checkEligibility(
				toApplicantId("07700900001", "Alice"),
				"Alice",
				undefined,
				"2026-03",
				env.pool,
			);
			expect(eligibility).toEqual({ status: "eligible" });
		});

		test("window closed → window_closed", async () => {
			await env.eventStore.appendToStream("lottery-2026-03", [
				{
					type: "ApplicationWindowOpened",
					data: { lotteryName: "2026-03", openedAt: "2026-03-01T00:00:00Z" },
				},
			]);
			await env.eventStore.appendToStream("lottery-2026-03", [
				{
					type: "ApplicationWindowClosed",
					data: {
						lotteryName: "2026-03",
						closedAt: "2026-03-31T23:59:59Z",
					},
				},
			]);

			const eligibility = await checkEligibility(
				toApplicantId("07700900001", "Alice"),
				"Alice",
				undefined,
				"2026-03",
				env.pool,
			);
			expect(eligibility).toEqual({ status: "window_closed" });
		});

		test("accepted application blocks same month (duplicate)", async () => {
			await openWindow(env, "2026-03");
			await submitAcceptedApplication(env, {
				applicationId: "app-1",
				phone: "07700900001",
				name: "Alice",
				lotteryName: "2026-03",
			});

			const eligibility = await checkEligibility(
				toApplicantId("07700900001", "Alice"),
				"Alice",
				undefined,
				"2026-03",
				env.pool,
			);
			expect(eligibility).toMatchObject({ status: "duplicate", ref: "app-1" });
			expect(eligibility.appliedAt).toBeDefined();
		});

		test("accepted-only does not trigger cooldown", async () => {
			await openWindow(env, "2026-03");
			await submitAcceptedApplication(env, {
				applicationId: "app-1",
				phone: "07700900001",
				name: "Alice",
				lotteryName: "2026-01",
			});

			const eligibility = await checkEligibility(
				toApplicantId("07700900001", "Alice"),
				"Alice",
				undefined,
				"2026-03",
				env.pool,
			);
			expect(eligibility).toEqual({ status: "eligible" });
		});

		test("selected triggers cooldown in following months", async () => {
			await openWindow(env, "2026-03");
			await submitAcceptedApplication(env, {
				applicationId: "app-1",
				phone: "07700900001",
				name: "Alice",
				lotteryName: "2026-01",
			});

			await env.eventStore.appendToStream("application-app-1", [
				{
					type: "ApplicationSelected",
					data: {
						applicationId: "app-1",
						applicantId: toApplicantId("07700900001", "Alice"),
						lotteryName: "2026-01",
						rank: 1,
						selectedAt: new Date().toISOString(),
					},
				},
			]);

			const eligibility = await checkEligibility(
				toApplicantId("07700900001", "Alice"),
				"Alice",
				undefined,
				"2026-03",
				env.pool,
			);
			expect(eligibility).toEqual({
				status: "cooldown",
				lastGrantMonth: "2026-01",
			});
		});

		test("cooldown expires after 3 months", async () => {
			await openWindow(env, "2026-03");
			await submitAcceptedApplication(env, {
				applicationId: "app-1",
				phone: "07700900001",
				name: "Alice",
				lotteryName: "2025-11",
			});

			await env.eventStore.appendToStream("application-app-1", [
				{
					type: "ApplicationSelected",
					data: {
						applicationId: "app-1",
						applicantId: toApplicantId("07700900001", "Alice"),
						lotteryName: "2025-11",
						rank: 1,
						selectedAt: new Date().toISOString(),
					},
				},
			]);

			const eligibility = await checkEligibility(
				toApplicantId("07700900001", "Alice"),
				"Alice",
				undefined,
				"2026-03",
				env.pool,
			);
			expect(eligibility).toEqual({ status: "eligible" });
		});

		test("cooldown across year boundary", async () => {
			await openWindow(env, "2026-02");

			await env.eventStore.appendToStream("application-app-1", [
				{
					type: "ApplicationSubmitted",
					data: {
						applicationId: "app-1",
						applicantId: "applicant-07700900001",
						identity: { phone: "07700900001", name: "Alice" },
						paymentPreference: "bank",
						meetingDetails: { place: "Mill Road" },
						lotteryName: "2025-12",
						submittedAt: new Date().toISOString(),
					},
				},
				{
					type: "ApplicationAccepted",
					data: {
						applicationId: "app-1",
						applicantId: "applicant-07700900001",
						lotteryName: "2025-12",
						acceptedAt: new Date().toISOString(),
					},
				},
				{
					type: "ApplicationSelected",
					data: {
						applicationId: "app-1",
						applicantId: "applicant-07700900001",
						lotteryName: "2025-12",
						rank: 1,
						selectedAt: new Date().toISOString(),
					},
				},
			]);

			const result = await checkEligibility(
				"applicant-07700900001",
				"Alice",
				undefined,
				"2026-02",
				env.pool,
			);
			expect(result).toEqual({
				status: "cooldown",
				lastGrantMonth: "2025-12",
			});
		});

		test("cooldown returns most recent selected month", async () => {
			await openWindow(env, "2026-03");

			for (const [appId, month] of [
				["app-1", "2026-01"],
				["app-2", "2026-02"],
			] as const) {
				await env.eventStore.appendToStream(`application-${appId}`, [
					{
						type: "ApplicationSubmitted",
						data: {
							applicationId: appId,
							applicantId: "applicant-07700900001",
							identity: { phone: "07700900001", name: "Alice" },
							paymentPreference: "bank",
							meetingDetails: { place: "Mill Road" },
							lotteryName: month,
							submittedAt: new Date().toISOString(),
						},
					},
					{
						type: "ApplicationAccepted",
						data: {
							applicationId: appId,
							applicantId: "applicant-07700900001",
							lotteryName: month,
							acceptedAt: new Date().toISOString(),
						},
					},
					{
						type: "ApplicationSelected",
						data: {
							applicationId: appId,
							applicantId: "applicant-07700900001",
							lotteryName: month,
							rank: 1,
							selectedAt: new Date().toISOString(),
						},
					},
				]);
			}

			const result = await checkEligibility(
				"applicant-07700900001",
				"Alice",
				undefined,
				"2026-03",
				env.pool,
			);
			expect(result).toEqual({
				status: "cooldown",
				lastGrantMonth: "2026-02",
			});
		});

		test("different applicant is not affected", async () => {
			await openWindow(env, "2026-03");

			await env.eventStore.appendToStream("application-app-1", [
				{
					type: "ApplicationSubmitted",
					data: {
						applicationId: "app-1",
						applicantId: "applicant-07700900002",
						identity: { phone: "07700900002", name: "Bob" },
						paymentPreference: "bank",
						meetingDetails: { place: "Mill Road" },
						lotteryName: "2026-03",
						submittedAt: new Date().toISOString(),
					},
				},
				{
					type: "ApplicationAccepted",
					data: {
						applicationId: "app-1",
						applicantId: "applicant-07700900002",
						lotteryName: "2026-03",
						acceptedAt: new Date().toISOString(),
					},
				},
				{
					type: "ApplicationSelected",
					data: {
						applicationId: "app-1",
						applicantId: "applicant-07700900002",
						lotteryName: "2026-03",
						rank: 1,
						selectedAt: new Date().toISOString(),
					},
				},
			]);

			const result = await checkEligibility(
				"applicant-07700900001",
				"Alice",
				undefined,
				"2026-03",
				env.pool,
			);
			expect(result).toEqual({ status: "eligible" });
		});

		test("skipWindowCheck allows eligibility when window is closed", async () => {
			const closed = await checkEligibility(
				"applicant-07700900001",
				"Alice",
				undefined,
				"2026-03",
				env.pool,
			);
			expect(closed).toEqual({ status: "window_closed" });

			const result = await checkEligibility(
				"applicant-07700900001",
				"Alice",
				undefined,
				"2026-03",
				env.pool,
				{ skipWindowCheck: true },
			);
			expect(result).toEqual({ status: "eligible" });
		});

		test("skipWindowCheck still enforces cooldown", async () => {
			await env.eventStore.appendToStream("application-app-1", [
				{
					type: "ApplicationSubmitted",
					data: {
						applicationId: "app-1",
						applicantId: "applicant-07700900001",
						identity: { phone: "07700900001", name: "Alice" },
						paymentPreference: "bank",
						meetingDetails: { place: "Mill Road" },
						lotteryName: "2026-02",
						submittedAt: new Date().toISOString(),
					},
				},
				{
					type: "ApplicationAccepted",
					data: {
						applicationId: "app-1",
						applicantId: "applicant-07700900001",
						lotteryName: "2026-02",
						acceptedAt: new Date().toISOString(),
					},
				},
				{
					type: "ApplicationSelected",
					data: {
						applicationId: "app-1",
						applicantId: "applicant-07700900001",
						lotteryName: "2026-02",
						rank: 1,
						selectedAt: new Date().toISOString(),
					},
				},
			]);

			const result = await checkEligibility(
				"applicant-07700900001",
				"Alice",
				undefined,
				"2026-03",
				env.pool,
				{ skipWindowCheck: true },
			);
			expect(result).toEqual({
				status: "cooldown",
				lastGrantMonth: "2026-02",
			});
		});

		test("eligible when prior application was not_selected", async () => {
			await openWindow(env, "2026-04");

			await env.eventStore.appendToStream("application-app-1", [
				{
					type: "ApplicationSubmitted",
					data: {
						applicationId: "app-1",
						applicantId: "applicant-07700900001",
						identity: { phone: "07700900001", name: "Alice" },
						paymentPreference: "bank",
						meetingDetails: { place: "Mill Road" },
						lotteryName: "2026-03",
						submittedAt: new Date().toISOString(),
					},
				},
				{
					type: "ApplicationAccepted",
					data: {
						applicationId: "app-1",
						applicantId: "applicant-07700900001",
						lotteryName: "2026-03",
						acceptedAt: new Date().toISOString(),
					},
				},
				{
					type: "ApplicationNotSelected",
					data: {
						applicationId: "app-1",
						applicantId: "applicant-07700900001",
						lotteryName: "2026-03",
						notSelectedAt: new Date().toISOString(),
					},
				},
			]);

			const result = await checkEligibility(
				"applicant-07700900001",
				"Alice",
				undefined,
				"2026-04",
				env.pool,
			);
			expect(result).toEqual({ status: "eligible" });
		});
	});
});
