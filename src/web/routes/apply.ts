import type {
	SQLiteConnectionPool,
	SQLiteEventStore,
} from "@event-driven-io/emmett-sqlite";
import { verifySolution } from "altcha-lib/v1";
import type { ApplicantRepository } from "../../domain/applicant/repository.ts";
import { toApplicantId } from "../../domain/application/applicantId.ts";
import { checkEligibility } from "../../domain/application/checkEligibility.ts";
import {
	isValidPhone,
	normalizePhone,
} from "../../domain/application/normalizePhone.ts";
import type { ApplicationRepository } from "../../domain/application/repository.ts";
import { submitApplication } from "../../domain/application/submitApplication.ts";
import type { PaymentPreference } from "../../domain/application/types.ts";
import type { DocumentStore } from "../../infrastructure/projections/documents.ts";
import { applyClosedPage, applyPage, applyResultPage } from "../pages/apply.ts";
import {
	autoCloseExpiredLottery,
	getCurrentLotteryMonthCycle,
	getLotteryClosingTimestamp,
} from "./utils.ts";

function drawDate(monthCycle: string): string {
	const [year, month] = monthCycle.split("-").map(Number) as [number, number];
	const lastDay = new Date(year, month, 0);
	const d = String(lastDay.getDate()).padStart(2, "0");
	const m = String(lastDay.getMonth() + 1).padStart(2, "0");
	return `${d}/${m}/${lastDay.getFullYear()}`;
}

async function isWindowOpen(
	monthCycle: string,
	pool: ReturnType<typeof SQLiteConnectionPool>,
): Promise<boolean> {
	return pool.withConnection(async (conn) => {
		const tables = await conn.query<{ name: string }>(
			"SELECT name FROM sqlite_master WHERE type='table' AND name='lottery_windows'",
		);
		if (tables.length === 0) return false;
		const rows = await conn.query<{ status: string }>(
			"SELECT status FROM lottery_windows WHERE month_cycle = ? LIMIT 1",
			[monthCycle],
		);
		return rows.length > 0 && rows[0]?.status === "open";
	});
}

export function createApplyRoutes(
	eventStore: SQLiteEventStore,
	pool: ReturnType<typeof SQLiteConnectionPool>,
	applicantRepo: ApplicantRepository,
	hmacKey: string,
	docStore: ReturnType<typeof DocumentStore>,
	appRepo: ApplicationRepository,
) {
	return {
		async showForm(): Promise<Response> {
			await autoCloseExpiredLottery(pool, eventStore);
			const monthCycle = await getCurrentLotteryMonthCycle(pool);
			const open = await isWindowOpen(monthCycle, pool);
			const closesAt = await getLotteryClosingTimestamp(pool);
			const html = open ? applyPage(closesAt ?? "") : applyClosedPage();
			return new Response(html, {
				headers: { "Content-Type": "text/html" },
			});
		},

		async handleSubmit(req: Request): Promise<Response> {
			try {
				await autoCloseExpiredLottery(pool, eventStore);
				const formData = await req.formData();
				const name = String(formData.get("name") ?? "").trim();
				const phone = String(formData.get("phone") ?? "").trim();
				const email = String(formData.get("email") ?? "").trim() || undefined;
				const meetingPlace =
					String(formData.get("meetingPlace") ?? "").trim() || undefined;
				const paymentPref = String(formData.get("paymentPreference") ?? "cash");

				const altcha = String(formData.get("altcha") ?? "");
				if (!altcha) {
					return new Response("Bot verification failed", { status: 400 });
				}
				const verified = await verifySolution(altcha, hmacKey);
				if (!verified) {
					return new Response("Bot verification failed", { status: 400 });
				}

				if (!name || !phone) {
					return new Response("Name and phone are required", {
						status: 400,
					});
				}

				if (!isValidPhone(phone)) {
					return new Response("Please enter a valid phone number", {
						status: 400,
					});
				}

				if (paymentPref === "cash" && !meetingPlace) {
					return new Response(
						"Meeting place is required for cash applications",
						{
							status: 400,
						},
					);
				}

				const normalizedPhone = normalizePhone(phone);

				let sortCode = "";
				let accountNumber = "";
				if (paymentPref === "bank") {
					sortCode = String(formData.get("sortCode") ?? "").trim();
					accountNumber = String(formData.get("accountNumber") ?? "").trim();
					if (!sortCode || !accountNumber) {
						return new Response(
							"Sort code and account number are required for bank transfer",
							{ status: 400 },
						);
					}
					if (!/^\d{2}-?\d{2}-?\d{2}$/.test(sortCode)) {
						return new Response(
							"Sort code must be 6 digits, e.g. 12-34-56 or 123456",
							{ status: 400 },
						);
					}
					if (!/^\d{8}$/.test(accountNumber)) {
						return new Response("Account number must be 8 digits", {
							status: 400,
						});
					}
				}

				const applicationId = crypto.randomUUID();

				const ALLOWED_POA_MIME_TYPES = [
					"image/jpeg",
					"image/png",
					"image/gif",
					"image/webp",
					"application/pdf",
				];

				let proofOfAddressRef = "";
				if (paymentPref === "bank") {
					const poaFile = formData.get("poa");
					if (poaFile instanceof File && poaFile.size > 0) {
						if (poaFile.size > 5 * 1024 * 1024) {
							return new Response("File too large (max 5MB)", { status: 400 });
						}
						if (!ALLOWED_POA_MIME_TYPES.includes(poaFile.type)) {
							return new Response("Invalid file type", { status: 400 });
						}
						const validatedMimeType = poaFile.type;
						const docId = crypto.randomUUID();
						const buffer = Buffer.from(await poaFile.arrayBuffer());
						await docStore.store({
							id: docId,
							entityId: applicationId,
							type: "proof_of_address",
							data: buffer,
							mimeType: validatedMimeType,
						});
						proofOfAddressRef = docId;
					}
				}

				const bankDetails =
					paymentPref === "bank" &&
					sortCode &&
					accountNumber &&
					proofOfAddressRef
						? { sortCode, accountNumber, proofOfAddressRef }
						: undefined;

				const paymentPreference: PaymentPreference =
					paymentPref === "bank" ? "bank" : "cash";
				const monthCycle = await getCurrentLotteryMonthCycle(pool);
				const applicantId = toApplicantId(normalizedPhone, name);
				const eligibility = await checkEligibility(
					applicantId,
					name,
					email,
					monthCycle,
					pool,
				);

				if (eligibility.status === "duplicate") {
					const params = new URLSearchParams({
						status: "rejected",
						reason: "duplicate",
						existingAppliedAt: eligibility.appliedAt ?? "",
						ref: eligibility.ref ?? "",
						drawDate: drawDate(monthCycle),
					});
					return Response.redirect(`/apply/result?${params}`, 302);
				}

				const { events } = await submitApplication(
					{
						applicationId,
						phone: normalizedPhone,
						name,
						email,
						paymentPreference,
						meetingPlace,
						monthCycle,
						eligibility,
						bankDetails,
					},
					eventStore,
					applicantRepo,
				);

				const lastEvent = events[events.length - 1];
				let status = "accepted";
				let reason = "";

				if (lastEvent?.type === "ApplicationRejected") {
					status = "rejected";
					reason = lastEvent.data.reason;
				} else if (lastEvent?.type === "ApplicationFlaggedForReview") {
					status = "flagged";
				}

				const app = await appRepo.getById(applicationId);
				const ref = String(app?.ref ?? applicationId);
				const params = new URLSearchParams({ status, ref });
				if (reason) params.set("reason", reason);

				return Response.redirect(`/apply/result?${params}`, 302);
			} catch (err: unknown) {
				const msg = err instanceof Error ? err.message : String(err);
				console.error("[APPLY ERROR]", msg);
				return new Response(`Server error: ${msg}`, { status: 500 });
			}
		},

		showResult(req: Request): Response {
			const url = new URL(req.url);
			const status = url.searchParams.get("status") ?? "accepted";
			const reason = url.searchParams.get("reason") ?? undefined;
			const ref = url.searchParams.get("ref") ?? undefined;
			const existingAppliedAt =
				url.searchParams.get("existingAppliedAt") || undefined;
			const drawDate = url.searchParams.get("drawDate") || undefined;
			const baseUrl = `${url.protocol}//${url.host}`;
			return new Response(
				applyResultPage(
					status,
					reason,
					ref,
					existingAppliedAt,
					drawDate,
					baseUrl,
				),
				{
					headers: { "Content-Type": "text/html" },
				},
			);
		},
	};
}
