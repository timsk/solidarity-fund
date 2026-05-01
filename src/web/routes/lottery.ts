import type {
	SQLiteConnectionPool,
	SQLiteEventStore,
} from "@event-driven-io/emmett-sqlite";
import type { ApplicationRepository } from "../../domain/application/repository.ts";
import type { ApplicationSelected } from "../../domain/application/types.ts";
import { processApplicationSelected } from "../../domain/grant/processManager.ts";
import {
	closeApplicationWindow,
	drawLottery,
	openApplicationWindow,
} from "../../domain/lottery/commandHandlers.ts";
import { processLotteryDrawn } from "../../domain/lottery/processManager.ts";
import type { LotteryDrawn } from "../../domain/lottery/types.ts";
import { lotteryContent, lotteryPage } from "../pages/lottery.ts";
import { patchElements, redirectTo, sseResponse } from "../sse.ts";
import { getCurrentLotteryMonthCycle } from "./utils.ts";

type LotteryWindowRow = { month_cycle: string; status: string };

async function getWindowStatus(
	monthCycle: string,
	pool: ReturnType<typeof SQLiteConnectionPool>,
): Promise<"initial" | "open" | "windowClosed" | "drawn"> {
	return pool.withConnection(async (conn) => {
		const tableRows = await conn.query<{ name: string }>(
			"SELECT name FROM sqlite_master WHERE type='table' AND name='lottery_windows'",
		);
		if (tableRows.length === 0) return "initial";

		const rows = await conn.query<LotteryWindowRow>(
			"SELECT month_cycle, status FROM lottery_windows WHERE month_cycle = ? LIMIT 1",
			[monthCycle],
		);
		const row = rows[0];
		if (!row) return "initial";
		if (row.status === "open") return "open";
		if (row.status === "closed") return "windowClosed";
		if (row.status === "drawn") return "drawn";
		return "initial";
	});
}

export function createLotteryRoutes(
	appRepo: ApplicationRepository,
	eventStore: SQLiteEventStore,
	pool: ReturnType<typeof SQLiteConnectionPool>,
) {
	return {
		async show(): Promise<Response> {
			const monthCycle = await getCurrentLotteryMonthCycle(pool);
			const status = await getWindowStatus(monthCycle, pool);
			return new Response(lotteryPage(monthCycle, status), {
				headers: { "Content-Type": "text/html" },
			});
		},

		async handleOpen(expectedClosingAt: string): Promise<Response> {
			const monthCycle = await getCurrentLotteryMonthCycle(pool);
			await openApplicationWindow(monthCycle, expectedClosingAt, eventStore);
			return sseResponse(patchElements(lotteryContent(monthCycle, "open")));
		},

		async handleClose(): Promise<Response> {
			const monthCycle = await getCurrentLotteryMonthCycle(pool);
			await closeApplicationWindow(monthCycle, eventStore);
			return sseResponse(
				patchElements(lotteryContent(monthCycle, "windowClosed")),
			);
		},

		async handleDraw(
			volunteerId: string,
			availableBalance: number,
			reserve: number,
			grantAmount: number,
		): Promise<Response> {
			const monthCycle = await getCurrentLotteryMonthCycle(pool);
			const applications = await appRepo.listByMonth(monthCycle);
			const applicantPool = applications
				.filter((a) => a.status === "accepted" || a.status === "confirmed")
				.map((a) => ({
					applicationId: a.id,
					applicantId: a.applicantId,
				}));

			await drawLottery(
				monthCycle,
				volunteerId,
				availableBalance,
				reserve,
				grantAmount,
				applicantPool,
				eventStore,
			);

			// Read back the LotteryDrawn event to feed the process manager
			const stream = await eventStore.readStream(`lottery-${monthCycle}`);
			const drawnEvent = stream.events.findLast(
				(e) => e.type === "LotteryDrawn",
			) as LotteryDrawn | undefined;
			if (drawnEvent) {
				await processLotteryDrawn(drawnEvent, eventStore);

				// Create grants for each selected application
				for (const selected of drawnEvent.data.selected) {
					const appStream = await eventStore.readStream(
						`application-${selected.applicationId}`,
					);
					const selectedEvent = appStream.events.find(
						(e) => e.type === "ApplicationSelected",
					) as ApplicationSelected | undefined;
					if (selectedEvent) {
						await processApplicationSelected(selectedEvent, eventStore, pool);
					}
				}
			}

			return sseResponse(redirectTo(`/applications?month=${monthCycle}`));
		},
	};
}
