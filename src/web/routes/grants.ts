import type {
	SQLiteConnectionPool,
	SQLiteEventStore,
} from "@event-driven-io/emmett-sqlite";
import {
	acceptCashAlternative,
	approveProofOfAddress,
	assignVolunteer,
	declineCashAlternative,
	recordPayment,
	recordReimbursement,
	rejectProofOfAddress,
	releaseSlot,
	updateBankDetails,
} from "../../domain/grant/commandHandlers.ts";
import { processSlotReleased } from "../../domain/grant/processManager.ts";
import type { GrantRepository } from "../../domain/grant/repository.ts";
import type { VolunteerRepository } from "../../domain/volunteer/repository.ts";
import type { DocumentStore } from "../../infrastructure/projections/documents.ts";
import { emptyPanel, grantPanel } from "../pages/grantPanel.ts";
import { grantsBoard, grantsPage } from "../pages/grants.ts";
import {
	patchElements,
	ServerSentEventGenerator,
	sseResponse,
} from "../sse.ts";
import { getCurrentLotteryMonthCycle } from "./utils.ts";

export function createGrantRoutes(
	grantRepo: GrantRepository,
	volunteerRepo: VolunteerRepository,
	docStore: ReturnType<typeof DocumentStore>,
	eventStore: SQLiteEventStore,
	pool: ReturnType<typeof SQLiteConnectionPool>,
) {
	async function refreshBoard(monthCycle: string) {
		const grants = await grantRepo.listByMonth(monthCycle);
		return grantsBoard(grants);
	}

	async function showPanel(grantId: string): Promise<string | null> {
		const grant = await grantRepo.getById(grantId);
		if (!grant) return null;
		const volunteers = await volunteerRepo.list();
		const hasDocument = !!grant.proofOfAddressRef;
		return grantPanel(grant, volunteers, hasDocument);
	}

	async function refreshGrantResponse(grantId: string): Promise<Response> {
		const grant = await grantRepo.getById(grantId);
		if (!grant) return new Response("Not found", { status: 404 });
		const panel = await showPanel(grantId);
		if (!panel) return new Response("Not found", { status: 404 });
		const board = await refreshBoard(grant.monthCycle);
		return sseResponse(patchElements(panel), patchElements(board));
	}

	return {
		async list(month?: string): Promise<Response> {
			const months = await grantRepo.listDistinctMonths();
			const currentMonth =
				month ?? months[0] ?? (await getCurrentLotteryMonthCycle(pool));
			const grants = await grantRepo.listByMonth(currentMonth);
			return new Response(grantsPage(grants, months, currentMonth), {
				headers: { "Content-Type": "text/html" },
			});
		},

		async detail(id: string): Promise<Response> {
			const panel = await showPanel(id);
			if (!panel) return new Response("Not found", { status: 404 });
			return sseResponse(patchElements(panel));
		},

		closePanel(): Response {
			return sseResponse(patchElements(emptyPanel()));
		},

		async handleAssignVolunteer(
			grantId: string,
			volunteerId: string,
		): Promise<Response> {
			await assignVolunteer(grantId, volunteerId, eventStore);
			return refreshGrantResponse(grantId);
		},

		async handleUpdateBankDetails(
			grantId: string,
			req: Request,
		): Promise<Response> {
			const result = await ServerSentEventGenerator.readSignals(req);
			if (!result.success) return new Response(result.error, { status: 400 });
			const sortCode = String(result.signals.editsortcode ?? "");
			const accountNumber = String(result.signals.editaccountnumber ?? "");
			await updateBankDetails(grantId, { sortCode, accountNumber }, eventStore);
			return refreshGrantResponse(grantId);
		},

		async handleApprovePoa(
			grantId: string,
			volunteerId: string,
		): Promise<Response> {
			await approveProofOfAddress(grantId, volunteerId, eventStore);
			return refreshGrantResponse(grantId);
		},

		async handleRejectPoa(
			grantId: string,
			volunteerId: string,
		): Promise<Response> {
			await rejectProofOfAddress(
				grantId,
				"Proof of address rejected",
				volunteerId,
				eventStore,
			);
			return refreshGrantResponse(grantId);
		},

		async handleAcceptCash(grantId: string): Promise<Response> {
			await acceptCashAlternative(grantId, eventStore);
			return refreshGrantResponse(grantId);
		},

		async handleDeclineCash(grantId: string): Promise<Response> {
			await declineCashAlternative(grantId, eventStore);
			const grant = await grantRepo.getById(grantId);
			if (grant) {
				processSlotReleased(
					{
						type: "SlotReleased",
						data: {
							grantId,
							applicationId: grantId,
							applicantId: grant.applicantId,
							monthCycle: grant.monthCycle,
							reason: "Cash alternative declined",
							releasedBy: "system",
							releasedAt: new Date().toISOString(),
						},
					},
					eventStore,
					pool,
				).catch(() => {});
			}
			return refreshGrantResponse(grantId);
		},

		async handleRecordPayment(
			grantId: string,
			amount: number,
			method: "bank" | "cash",
			volunteerId: string,
		): Promise<Response> {
			await recordPayment(
				grantId,
				{ amount, method, paidBy: volunteerId },
				eventStore,
			);
			return refreshGrantResponse(grantId);
		},

		async handleRecordReimbursement(
			grantId: string,
			expenseReference: string,
			volunteerId: string,
		): Promise<Response> {
			await recordReimbursement(
				grantId,
				{ volunteerId, expenseReference },
				eventStore,
			);
			return refreshGrantResponse(grantId);
		},

		async handleRelease(
			grantId: string,
			reason: string,
			volunteerId: string,
		): Promise<Response> {
			await releaseSlot(grantId, reason, volunteerId, eventStore);
			const grant = await grantRepo.getById(grantId);
			if (grant) {
				processSlotReleased(
					{
						type: "SlotReleased",
						data: {
							grantId,
							applicationId: grantId,
							applicantId: grant.applicantId,
							monthCycle: grant.monthCycle,
							reason,
							releasedBy: volunteerId,
							releasedAt: new Date().toISOString(),
						},
					},
					eventStore,
					pool,
				).catch(() => {});
			}
			return refreshGrantResponse(grantId);
		},

		async handleUpdateNotes(id: string, req: Request): Promise<Response> {
			const result = await ServerSentEventGenerator.readSignals(req);
			if (!result.success) {
				return new Response(result.error, { status: 400 });
			}
			const notes = String(result.signals.grantnotes ?? "");
			await grantRepo.updateNotes(id, notes);
			return sseResponse();
		},

		async serveDocument(docId: string): Promise<Response> {
			const doc = await docStore.getById(docId);
			if (!doc) return new Response("Not found", { status: 404 });
			return new Response(doc.data, {
				headers: {
					"Content-Type": doc.mimeType,
					"Content-Disposition": "inline",
				},
			});
		},
	};
}
