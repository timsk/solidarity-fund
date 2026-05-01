import { beforeEach, describe, expect, test } from "bun:test";
import {
	type EventStore,
	getInMemoryEventStore,
} from "@event-driven-io/emmett";
import {
	cancelLottery,
	closeApplicationWindow,
	drawLottery,
	openApplicationWindow,
} from "../../src/domain/lottery/commandHandlers.ts";

describe("lottery command handlers", () => {
	let eventStore: EventStore;

	beforeEach(() => {
		eventStore = getInMemoryEventStore();
	});

	test("openApplicationWindow appends ApplicationWindowOpened", async () => {
		await openApplicationWindow("2026-03", "2026-03-31T23:59:00Z", eventStore);
		const stream = await eventStore.readStream("lottery-2026-03");
		expect(stream.events).toHaveLength(1);
		expect(stream.events[0]!.type).toBe("ApplicationWindowOpened");
	});

	test("closeApplicationWindow appends ApplicationWindowClosed", async () => {
		await openApplicationWindow("2026-03", "2026-03-31T23:59:00Z", eventStore);
		await closeApplicationWindow("2026-03", eventStore);
		const stream = await eventStore.readStream("lottery-2026-03");
		expect(stream.events).toHaveLength(2);
		expect(stream.events[1]!.type).toBe("ApplicationWindowClosed");
	});

	test("drawLottery appends LotteryDrawn", async () => {
		await openApplicationWindow("2026-03", "2026-03-31T23:59:00Z", eventStore);
		await closeApplicationWindow("2026-03", eventStore);
		await drawLottery(
			"2026-03",
			"vol-1",
			200,
			0,
			40,
			[
				{ applicationId: "app-1", applicantId: "a-1" },
				{ applicationId: "app-2", applicantId: "a-2" },
			],
			eventStore,
		);
		const stream = await eventStore.readStream("lottery-2026-03");
		expect(stream.events).toHaveLength(3);
		expect(stream.events[2]!.type).toBe("LotteryDrawn");
	});

	test("cancelLottery appends LotteryCancelled", async () => {
		await openApplicationWindow("2026-03", "2026-03-31T23:59:00Z", eventStore);
		await cancelLottery("2026-03", eventStore);
		const stream = await eventStore.readStream("lottery-2026-03");
		expect(stream.events).toHaveLength(2);
		expect(stream.events[1]!.type).toBe("LotteryCancelled");
		expect(stream.events[1]!.data.previousStatus).toBe("open");
	});

	test("cancelLottery from windowClosed works", async () => {
		await openApplicationWindow("2026-03", "2026-03-31T23:59:00Z", eventStore);
		await closeApplicationWindow("2026-03", eventStore);
		await cancelLottery("2026-03", eventStore);
		const stream = await eventStore.readStream("lottery-2026-03");
		expect(stream.events).toHaveLength(3);
		expect(stream.events[2]!.type).toBe("LotteryCancelled");
		expect(stream.events[2]!.data.previousStatus).toBe("windowClosed");
	});
});
