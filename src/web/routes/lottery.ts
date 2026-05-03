import type {
	SQLiteConnectionPool,
	SQLiteEventStore,
} from "@event-driven-io/emmett-sqlite";
import type { ApplicationRepository } from "../../domain/application/repository.ts";
import type { ApplicationSelected } from "../../domain/application/types.ts";
import { processApplicationSelected } from "../../domain/grant/processManager.ts";
import {
	cancelLottery,
	closeApplicationWindow,
	drawLottery,
	openApplicationWindow,
} from "../../domain/lottery/commandHandlers.ts";
import {
	processLotteryCancelled,
	processLotteryDrawn,
} from "../../domain/lottery/processManager.ts";
import type {
	LotteryCancelled,
	LotteryDrawn,
} from "../../domain/lottery/types.ts";
import { lotteryContent, lotteryPage } from "../pages/lottery.ts";
import { patchElements, redirectTo, sseResponse } from "../sse.ts";
import { getCurrentLotteryName } from "./utils.ts";

type LotteryWindowRow = { lottery_name: string; status: string };

async function getWindowStatus(
	lotteryName: string,
	pool: ReturnType<typeof SQLiteConnectionPool>,
): Promise<"initial" | "open" | "windowClosed" | "drawn" | "cancelled"> {
	return pool.withConnection(async (conn) => {
		const tableRows = await conn.query<{ name: string }>(
			"SELECT name FROM sqlite_master WHERE type='table' AND name='lottery_windows'",
		);
		if (tableRows.length === 0) return "initial";

		const rows = await conn.query<LotteryWindowRow>(
			"SELECT lottery_name, status FROM lottery_windows WHERE lottery_name = ? LIMIT 1",
			[lotteryName],
		);
		const row = rows[0];
		if (!row) return "initial";
		if (row.status === "open") return "open";
		if (row.status === "closed") return "windowClosed";
		if (row.status === "drawn") return "drawn";
		if (row.status === "cancelled") return "cancelled";
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
			const lotteryName = await getCurrentLotteryName(pool);
			const status = await getWindowStatus(lotteryName, pool);
			return new Response(lotteryPage(lotteryName, status), {
				headers: { "Content-Type": "text/html" },
			});
		},

		async handleOpen(
			lotteryName: string,
			expectedClosingAt: string,
		): Promise<Response> {
			const existingOpen = await pool.withConnection(async (conn) => {
				const rows = await conn.query<{ lottery_name: string }>(
					"SELECT lottery_name FROM lottery_windows WHERE status = 'open' LIMIT 1",
				);
				return rows.length > 0;
			});
			if (existingOpen) {
				return new Response("A lottery is already open. Close it first.", {
					status: 409,
				});
			}

			const existingName = await pool.withConnection(async (conn) => {
				const rows = await conn.query<{ lottery_name: string }>(
					"SELECT lottery_name FROM lottery_windows WHERE lottery_name = ? LIMIT 1",
					[lotteryName],
				);
				return rows.length > 0;
			});
			if (existingName) {
				const errorHtml = `<div id="lottery-error" class="text-red-600 text-sm font-medium" role="alert">A lottery named '${lotteryName.replace(/'/g, "\\'")}' already exists. Choose a different name.</div>`;
				return sseResponse(patchElements(errorHtml));
			}

			try {
				await openApplicationWindow(lotteryName, expectedClosingAt, eventStore);
				return sseResponse(patchElements(lotteryContent(lotteryName, "open")));
			} catch (err) {
				const message =
					err instanceof Error ? err.message : "Failed to open lottery";
				const errorHtml = `<div id="lottery-error" class="text-red-600 text-sm font-medium" role="alert">${message.replace(/'/g, "\\'")}</div>`;
				return sseResponse(patchElements(errorHtml));
			}
		},

		async handleClose(): Promise<Response> {
			const lotteryName = await getCurrentLotteryName(pool);
			await closeApplicationWindow(lotteryName, eventStore);
			return sseResponse(
				patchElements(lotteryContent(lotteryName, "windowClosed")),
			);
		},

		async handleDraw(
			volunteerId: string,
			availableBalance: number,
			reserve: number,
			grantAmount: number,
		): Promise<Response> {
			const lotteryName = await getCurrentLotteryName(pool);
			const applications = await appRepo.listByLottery(lotteryName);
			const applicantPool = applications
				.filter((a) => a.status === "accepted" || a.status === "confirmed")
				.map((a) => ({
					applicationId: a.id,
					applicantId: a.applicantId,
				}));

			await drawLottery(
				lotteryName,
				volunteerId,
				availableBalance,
				reserve,
				grantAmount,
				applicantPool,
				eventStore,
			);

			// Read back the LotteryDrawn event to feed the process manager
			const stream = await eventStore.readStream(`lottery-${lotteryName}`);
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

			return sseResponse(redirectTo(`/applications?month=${lotteryName}`));
		},

		async handleCancel(): Promise<Response> {
			const lotteryName = await getCurrentLotteryName(pool);
			const applications = await appRepo.listByLottery(lotteryName);
			const applicationIds = applications
				.filter(
					(a) =>
						a.status === "accepted" ||
						a.status === "confirmed" ||
						a.status === "flagged",
				)
				.map((a) => a.id);

			await cancelLottery(lotteryName, eventStore);

			// Read back the LotteryCancelled event to feed the process manager
			const stream = await eventStore.readStream(`lottery-${lotteryName}`);
			const cancelledEvent = stream.events.findLast(
				(e) => e.type === "LotteryCancelled",
			) as LotteryCancelled | undefined;
			if (cancelledEvent) {
				await processLotteryCancelled(
					cancelledEvent,
					eventStore,
					applicationIds,
				);
			}

			return sseResponse(
				patchElements(lotteryContent(lotteryName, "cancelled")),
			);
		},
	};
}
