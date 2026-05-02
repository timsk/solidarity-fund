import { expect, test } from "bun:test";
import type { ReadEvent } from "@event-driven-io/emmett";
import type { SQLiteConnectionPool } from "@event-driven-io/emmett-sqlite";
import { renderSmsNotification } from "./notificationRenderer.ts";

type FakePool = {
	withConnection: <T>(fn: (conn: FakeConn) => Promise<T>) => Promise<T>;
};

type FakeConn = {
	querySingle: (sql: string, params: unknown[]) => Promise<unknown>;
};

function createFakePool(phone: string | null): FakePool {
	return {
		async withConnection(fn) {
			return fn({
				async querySingle(_sql, _params) {
					return phone ? { phone } : null;
				},
			} as unknown as FakeConn);
		},
	};
}

test("returns null for events with no matching template (GrantCreated)", async () => {
	const pool = createFakePool("+447777777777");
	const result = await renderSmsNotification(
		{
			type: "GrantCreated",
			kind: "Event",
			data: {
				grantId: "grant-123",
				applicantId: "applicant-1",
				lotteryName: "2025-04",
				amount: 500,
				createdAt: "2025-04-10T00:00:00Z",
			},
		} as ReadEvent<any>,
		pool as FakePool as unknown as ReturnType<typeof SQLiteConnectionPool>,
	);
	expect(result).toBeNull();
});

test("returns null for events with no matching template (ApplicationConfirmed)", async () => {
	const pool = createFakePool("+447777777777");
	const result = await renderSmsNotification(
		{
			type: "ApplicationConfirmed",
			kind: "Event",
			data: {
				applicationId: "app-123",
				applicantId: "applicant-1",
				volunteerId: "vol-1",
				lotteryName: "2025-04",
				confirmedAt: "2025-04-10T00:00:00Z",
			},
		} as ReadEvent<any>,
		pool as FakePool as unknown as ReturnType<typeof SQLiteConnectionPool>,
	);
	expect(result).toBeNull();
});

test("ApplicationSubmitted with identity.phone resolves phone from event data", async () => {
	const pool = createFakePool("+447777777777");
	const result = await renderSmsNotification(
		{
			type: "ApplicationSubmitted",
			kind: "Event",
			data: {
				applicationId: "app-123",
				applicantId: "applicant-1",
				identity: {
					phone: "+441234567890",
					name: "John Doe",
				},
				paymentPreference: "bank",
				lotteryName: "2025-04",
				submittedAt: "2025-04-10T00:00:00Z",
			},
		} as ReadEvent<any>,
		pool as FakePool as unknown as ReturnType<typeof SQLiteConnectionPool>,
	);
	expect(result).not.toBeNull();
	expect(result?.channel).toBe("sms");
	expect(result?.recipient).toBe("+441234567890");
	expect(result?.body).toContain("pp-123");
	expect(result?.body).toContain("Community Solidarity Fund");
});

test("ApplicationAccepted with applicantId resolves phone from pool", async () => {
	const pool = createFakePool("+447777777777");
	const result = await renderSmsNotification(
		{
			type: "ApplicationAccepted",
			kind: "Event",
			data: {
				applicationId: "app-123",
				applicantId: "applicant-1",
				lotteryName: "2025-04",
				acceptedAt: "2025-04-10T00:00:00Z",
			},
		} as ReadEvent<any>,
		pool as FakePool as unknown as ReturnType<typeof SQLiteConnectionPool>,
	);
	expect(result).not.toBeNull();
	expect(result?.channel).toBe("sms");
	expect(result?.recipient).toBe("+447777777777");
	expect(result?.body).toContain("accepted");
});

test("returns null when applicantId exists but no phone in DB", async () => {
	const pool = createFakePool(null);
	const result = await renderSmsNotification(
		{
			type: "ApplicationAccepted",
			kind: "Event",
			data: {
				applicationId: "app-123",
				applicantId: "applicant-1",
				lotteryName: "2025-04",
				acceptedAt: "2025-04-10T00:00:00Z",
			},
		} as ReadEvent<any>,
		pool as FakePool as unknown as ReturnType<typeof SQLiteConnectionPool>,
	);
	expect(result).toBeNull();
});

test("ApplicationRejected produces body containing formatted reason", async () => {
	const pool = createFakePool("+447777777777");
	const result = await renderSmsNotification(
		{
			type: "ApplicationRejected",
			kind: "Event",
			data: {
				applicationId: "app-123",
				applicantId: "applicant-1",
				reason: "cooldown",
				detail: "Applied within 3 month cooldown period",
				lotteryName: "2025-04",
				rejectedAt: "2025-04-10T00:00:00Z",
			},
		} as ReadEvent<any>,
		pool as FakePool as unknown as ReturnType<typeof SQLiteConnectionPool>,
	);
	expect(result).not.toBeNull();
	expect(result?.body).toContain("You have applied too recently");
	expect(result?.body).not.toContain("cooldown");
});

test("ApplicationNotSelected returns correct body", async () => {
	const pool = createFakePool("+447777777777");
	const result = await renderSmsNotification(
		{
			type: "ApplicationNotSelected",
			kind: "Event",
			data: {
				applicationId: "app-123",
				applicantId: "applicant-1",
				lotteryName: "2025-04",
				notSelectedAt: "2025-04-10T00:00:00Z",
			},
		} as ReadEvent<any>,
		pool as FakePool as unknown as ReturnType<typeof SQLiteConnectionPool>,
	);
	expect(result).not.toBeNull();
	expect(result?.channel).toBe("sms");
	expect(result?.recipient).toBe("+447777777777");
	expect(result?.body).toContain("not selected");
	expect(result?.body).toContain("apply again next month");
});

test("returned shape always has channel: sms", async () => {
	const pool = createFakePool("+447777777777");
	const result = await renderSmsNotification(
		{
			type: "ApplicationSubmitted",
			kind: "Event",
			data: {
				applicationId: "app-123",
				applicantId: "applicant-1",
				identity: {
					phone: "+441234567890",
					name: "John Doe",
				},
				paymentPreference: "bank",
				lotteryName: "2025-04",
				submittedAt: "2025-04-10T00:00:00Z",
			},
		} as ReadEvent<any>,
		pool as FakePool as unknown as ReturnType<typeof SQLiteConnectionPool>,
	);
	expect(result?.channel).toBe("sms");
});
