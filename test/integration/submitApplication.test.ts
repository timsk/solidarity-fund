import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type {
	SQLiteConnectionPool,
	SQLiteEventStore,
} from "@event-driven-io/emmett-sqlite";
import type { ApplicantRepository } from "../../src/domain/applicant/repository.ts";
import { submitApplication } from "../../src/domain/application/submitApplication.ts";
import { createEventStore } from "../../src/infrastructure/eventStore.ts";

describe("submitApplication — auto-approval feature flag", () => {
	let eventStore: SQLiteEventStore;
	let pool: ReturnType<typeof SQLiteConnectionPool>;
	let applicantRepo: ApplicantRepository;

	beforeEach(async () => {
		const es = createEventStore(":memory:");
		eventStore = es.store;
		pool = es.pool;

		applicantRepo = {
			getById: async () => null,
			getByPhone: async () => [],
			getByPhoneAndName: async () => null,
			list: async () => [],
			updateNotes: async () => {},
		};
	});

	afterEach(async () => {
		await pool.close();
	});

	function formData(overrides?: {
		autoApproveEnabled?: boolean;
		eligibility?: typeof fixture.eligibility;
	}) {
		return {
			...fixture,
			autoApproveEnabled: overrides?.autoApproveEnabled,
			eligibility: overrides?.eligibility ?? fixture.eligibility,
		};
	}

	const fixture = {
		applicationId: "app-test-001",
		phone: "07700900000",
		name: "Jane Doe",
		lotteryName: "2026-05",
		paymentPreference: "bank" as const,
		eligibility: { status: "eligible" as const },
	};

	test("auto-approves when autoApproveEnabled is true (default)", async () => {
		const result = await submitApplication(
			formData({ autoApproveEnabled: true }),
			eventStore,
			applicantRepo,
		);

		expect(result.events).toHaveLength(2);
		expect(result.events[0]?.type).toBe("ApplicationSubmitted");
		expect(result.events[1]?.type).toBe("ApplicationAccepted");
	});

	test("auto-approves when autoApproveEnabled is unset", async () => {
		const result = await submitApplication(
			formData({ autoApproveEnabled: undefined }),
			eventStore,
			applicantRepo,
		);

		expect(result.events).toHaveLength(2);
		expect(result.events[0]?.type).toBe("ApplicationSubmitted");
		expect(result.events[1]?.type).toBe("ApplicationAccepted");
	});

	test("flags for review when autoApproveEnabled is false", async () => {
		const result = await submitApplication(
			formData({ autoApproveEnabled: false }),
			eventStore,
			applicantRepo,
		);

		expect(result.events).toHaveLength(2);
		expect(result.events[0]?.type).toBe("ApplicationSubmitted");
		expect(result.events[1]?.type).toBe("ApplicationFlaggedForReview");
		expect(result.events[1]?.data).toMatchObject({
			reason: "Auto-approval disabled",
		});
	});

	test("rejects regardless of flag when not eligible", async () => {
		const result = await submitApplication(
			formData({
				autoApproveEnabled: true,
				eligibility: { status: "cooldown", lastGrantSelectedAt: "2026-04-01T00:00:00Z", eligibleAfter: "2026-06-01T00:00:00Z", cooldownDays: 90 },
			}),
			eventStore,
			applicantRepo,
		);

		expect(result.events[1]?.type).toBe("ApplicationRejected");
		expect(result.events[1]?.data).toMatchObject({ reason: "cooldown" });
	});
});
