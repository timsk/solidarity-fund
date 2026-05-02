import { expect, test } from "bun:test";
import type { ReadEvent } from "@event-driven-io/emmett";
import type { SQLiteConnectionPool } from "@event-driven-io/emmett-sqlite";
import { renderEmailNotification } from "../../../src/infrastructure/email/notificationRenderer.ts";

type FakePool = {
	withConnection: <T>(fn: (conn: FakeConn) => Promise<T>) => Promise<T>;
};

type FakeConn = {
	querySingle: (sql: string, params: unknown[]) => Promise<unknown>;
};

function createFakePool(email: string | null): FakePool {
	return {
		async withConnection(fn) {
			return fn({
				async querySingle(_sql, _params) {
					return email ? { email } : null;
				},
			} as unknown as FakeConn);
		},
	};
}

test("returns null for events with no matching email template (GrantCreated)", async () => {
	const pool = createFakePool("alice@example.com");
	const result = await renderEmailNotification(
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

test("returns null when template exists but applicant has no email on event data (ApplicationSubmitted without identity.email)", async () => {
	const pool = createFakePool(null);
	const result = await renderEmailNotification(
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
	expect(result).toBeNull();
});

test("ApplicationSubmitted with identity.email resolves email from event data", async () => {
	const pool = createFakePool("ignored@example.com");
	const result = await renderEmailNotification(
		{
			type: "ApplicationSubmitted",
			kind: "Event",
			data: {
				applicationId: "app-123",
				applicantId: "applicant-1",
				identity: {
					phone: "+441234567890",
					name: "John Doe",
					email: "john@example.com",
				},
				paymentPreference: "bank",
				lotteryName: "2025-04",
				submittedAt: "2025-04-10T00:00:00Z",
			},
		} as ReadEvent<any>,
		pool as FakePool as unknown as ReturnType<typeof SQLiteConnectionPool>,
	);
	expect(result).not.toBeNull();
	expect(result?.channel).toBe("email");
	expect(result?.recipient).toBe("john@example.com");
	expect(result?.subject).toContain("Application received");
	expect(result?.body).toContain("pp-123");
	expect(result?.body).toContain("Community Solidarity Fund");
});

test("ApplicationAccepted with applicantId resolves email from pool", async () => {
	const pool = createFakePool("alice@example.com");
	const result = await renderEmailNotification(
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
	expect(result?.channel).toBe("email");
	expect(result?.recipient).toBe("alice@example.com");
	expect(result?.subject).toContain("Application accepted");
	expect(result?.body).toContain("accepted");
});

test("returns null when applicantId exists but no email in DB", async () => {
	const pool = createFakePool(null);
	const result = await renderEmailNotification(
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
