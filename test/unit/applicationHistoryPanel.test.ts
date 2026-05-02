import { describe, expect, test } from "bun:test";
import type { ApplicationEvent } from "../../src/domain/application/types.ts";
import {
	applicationHistoryPanel,
	extractReviewHistory,
} from "../../src/web/pages/applicationHistoryPanel.ts";

describe("applicationHistoryPanel", () => {
	test("renders confirmed event with volunteer name", () => {
		const html = applicationHistoryPanel([
			{
				type: "ApplicationConfirmed",
				volunteerName: "James",
				timestamp: "2026-04-26T10:26:00.000Z",
			},
		]);
		expect(html).toContain("Confirmed");
		expect(html).toContain("James");
		expect(html).toContain("26 Apr 2026");
		expect(html).toContain("10:26");
	});

	test("renders rejected event with volunteer name", () => {
		const html = applicationHistoryPanel([
			{
				type: "ApplicationRejected",
				volunteerName: "Anita",
				timestamp: "2026-04-24T22:31:00.000Z",
			},
		]);
		expect(html).toContain("Rejected");
		expect(html).toContain("Anita");
		expect(html).toContain("24 Apr 2026");
		expect(html).toContain("22:31");
	});

	test("renders events in reverse order (newest first)", () => {
		const html = applicationHistoryPanel([
			{
				type: "ApplicationRejected",
				volunteerName: "James",
				timestamp: "2026-04-24T22:31:00.000Z",
			},
			{
				type: "ApplicationConfirmed",
				volunteerName: "Anita",
				timestamp: "2026-04-25T11:49:00.000Z",
			},
			{
				type: "ApplicationRejected",
				volunteerName: "Anita",
				timestamp: "2026-04-26T20:55:00.000Z",
			},
		]);
		const firstRejectIdx = html.indexOf("Rejected");
		const confirmIdx = html.indexOf("Confirmed");
		const lastRejectIdx = html.lastIndexOf("Rejected");
		// Newest first: 26 Apr reject → 25 Apr confirm → 24 Apr reject
		expect(firstRejectIdx).toBeLessThan(confirmIdx);
		expect(confirmIdx).toBeLessThan(lastRejectIdx);
	});

	test("shows 'a volunteer' when volunteerName is null", () => {
		const html = applicationHistoryPanel([
			{
				type: "ApplicationRejected",
				volunteerName: null,
				timestamp: "2026-04-24T22:31:00.000Z",
			},
		]);
		expect(html).toContain("a volunteer");
	});

	test("renders empty state when no review history", () => {
		const html = applicationHistoryPanel([]);
		expect(html).toContain("No review history");
	});

	test("renders confirmation with green dot", () => {
		const html = applicationHistoryPanel([
			{
				type: "ApplicationConfirmed",
				volunteerName: "James",
				timestamp: "2026-04-26T10:26:00.000Z",
			},
		]);
		expect(html).toContain("bg-green-500");
	});

	test("renders rejection with red dot", () => {
		const html = applicationHistoryPanel([
			{
				type: "ApplicationRejected",
				volunteerName: "Anita",
				timestamp: "2026-04-26T10:26:00.000Z",
			},
		]);
		expect(html).toContain("bg-red-500");
	});
});

describe("extractReviewHistory", () => {
	const events: ApplicationEvent[] = [
		{
			type: "ApplicationSubmitted",
			data: {
				applicationId: "app-1",
				applicantId: "applicant-1",
				identity: { phone: "07700900001", name: "Alice" },
				paymentPreference: "cash",
				lotteryName: "2026-04",
				submittedAt: "2026-04-24T10:00:00Z",
			},
		},
		{
			type: "ApplicationFlaggedForReview",
			data: {
				applicationId: "app-1",
				applicantId: "applicant-1",
				reason: "Name mismatch",
				lotteryName: "2026-04",
				flaggedAt: "2026-04-24T10:00:00Z",
			},
		},
		{
			type: "ApplicationRejected",
			data: {
				applicationId: "app-1",
				applicantId: "applicant-1",
				reason: "identity_mismatch",
				detail: "Rejected by volunteer review",
				volunteerId: "vol-1",
				lotteryName: "2026-04",
				rejectedAt: "2026-04-24T22:31:00Z",
			},
		},
		{
			type: "ApplicationConfirmed",
			data: {
				applicationId: "app-1",
				applicantId: "applicant-2",
				volunteerId: "vol-2",
				lotteryName: "2026-04",
				confirmedAt: "2026-04-25T11:49:00Z",
			},
		},
	];

	const volunteerNames = new Map([
		["vol-1", "James"],
		["vol-2", "Anita"],
	]);

	test("extracts only confirmed and rejected events", () => {
		const history = extractReviewHistory(events, volunteerNames);
		expect(history).toHaveLength(2);
		expect(history[0]!.type).toBe("ApplicationRejected");
		expect(history[1]!.type).toBe("ApplicationConfirmed");
	});

	test("resolves volunteer names from map", () => {
		const history = extractReviewHistory(events, volunteerNames);
		expect(history[0]!.volunteerName).toBe("James");
		expect(history[1]!.volunteerName).toBe("Anita");
	});

	test("falls back to null when volunteerId not in map", () => {
		const unknownEvents: ApplicationEvent[] = [
			{
				type: "ApplicationConfirmed",
				data: {
					applicationId: "app-2",
					applicantId: "applicant-3",
					volunteerId: "vol-unknown",
					lotteryName: "2026-04",
					confirmedAt: "2026-04-26T10:00:00Z",
				},
			},
		];
		const history = extractReviewHistory(unknownEvents, new Map());
		expect(history[0]!.volunteerName).toBe("unknown");
	});

	test("returns empty array when no review events exist", () => {
		const noReview: ApplicationEvent[] = [
			{
				type: "ApplicationSubmitted",
				data: {
					applicationId: "app-1",
					applicantId: "applicant-1",
					identity: { phone: "07700900001", name: "Alice" },
					paymentPreference: "cash",
					lotteryName: "2026-04",
					submittedAt: "2026-04-24T10:00:00Z",
				},
			},
		];
		const history = extractReviewHistory(noReview, volunteerNames);
		expect(history).toHaveLength(0);
	});

	test("timestamps come from confirmedAt or rejectedAt", () => {
		const history = extractReviewHistory(events, volunteerNames);
		expect(history[0]!.timestamp).toBe("2026-04-24T22:31:00Z");
		expect(history[1]!.timestamp).toBe("2026-04-25T11:49:00Z");
	});
});
