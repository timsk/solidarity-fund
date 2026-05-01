import type {
	SQLiteConnectionPool,
	SQLiteEventStore,
} from "@event-driven-io/emmett-sqlite";
import type { ApplicantRepository } from "../../domain/applicant/repository.ts";
import { toApplicantId } from "../../domain/application/applicantId.ts";
import { checkEligibility } from "../../domain/application/checkEligibility.ts";
import type {
	ApplicationFilters,
	ApplicationRepository,
} from "../../domain/application/repository.ts";
import {
	revertReviewApplication,
	reviewApplication,
} from "../../domain/application/reviewApplication.ts";
import type { ApplicationEvent } from "../../domain/application/types.ts";
import type { VolunteerRepository } from "../../domain/volunteer/repository.ts";
import {
	applicationHistoryPanel,
	extractReviewHistory,
} from "../pages/applicationHistoryPanel.ts";
import {
	revertablePanel,
	reviewPanel,
	viewPanel,
} from "../pages/applicationPanel.ts";
import {
	applicationsPage,
	applicationsTableBody,
} from "../pages/applications.ts";
import { patchElements, sseResponse } from "../sse.ts";
import { getCurrentLotteryMonthCycle } from "./utils.ts";

export function createApplicationRoutes(
	appRepo: ApplicationRepository,
	applicantRepo: ApplicantRepository,
	volunteerRepo: VolunteerRepository,
	eventStore: SQLiteEventStore,
	pool: ReturnType<typeof SQLiteConnectionPool>,
) {
	return {
		async list(
			month?: string,
			filters?: ApplicationFilters,
		): Promise<Response> {
			const months = await appRepo.listDistinctMonths();
			const currentMonth =
				month ?? months[0] ?? (await getCurrentLotteryMonthCycle(pool));
			const applications = await appRepo.listByMonth(currentMonth, filters);
			return new Response(
				applicationsPage(applications, months, currentMonth, filters),
				{
					headers: { "Content-Type": "text/html" },
				},
			);
		},

		async detail(id: string): Promise<Response> {
			const app = await appRepo.getById(id);
			if (!app) return new Response("Not found", { status: 404 });
			const applicant =
				app.phone && app.name
					? await applicantRepo.getByPhoneAndName(app.phone, app.name)
					: null;
			const reviewedByName = await resolveReviewedBy(app, volunteerRepo);

			let panel: string;
			if (app.status === "flagged" || app.status === "accepted") {
				panel = reviewPanel(app, applicant?.id ?? null, reviewedByName);
			} else if (app.status === "confirmed" || app.status === "rejected") {
				panel = revertablePanel(app, applicant?.id ?? null, reviewedByName);
			} else {
				panel = viewPanel(app, applicant?.id ?? null, reviewedByName);
			}
			return sseResponse(patchElements(panel));
		},

		async handleReview(
			applicationId: string,
			decision: "confirm" | "reject",
			volunteerId: string,
		): Promise<Response> {
			const app = await appRepo.getById(applicationId);
			if (!app) return new Response("Not found", { status: 404 });

			// When confirming, check eligibility against the submitted identity (phone+name),
			// not the conflicting existing applicant. This allows confirmation even when the
			// existing applicant already has an accepted application this month.
			const confirmedApplicantId =
				decision === "confirm" && app.phone && app.name
					? toApplicantId(app.phone, app.name)
					: undefined;

			const eligibility =
				decision === "confirm"
					? await checkEligibility(
							confirmedApplicantId ?? app.applicantId,
							app.name ?? "",
							app.email ?? undefined,
							app.monthCycle,
							pool,
							{ skipWindowCheck: true, excludeApplicationId: applicationId },
						)
					: ({ status: "eligible" } as const);

			await reviewApplication(
				applicationId,
				volunteerId,
				decision,
				eligibility,
				eventStore,
				confirmedApplicantId,
			);

			const updated = await appRepo.getById(applicationId);
			if (!updated) return new Response("Not found", { status: 404 });

			const reviewedByName = await resolveReviewedBy(updated, volunteerRepo);
			const applications = await appRepo.listByMonth(app.monthCycle);
			return sseResponse(
				patchElements(revertablePanel(updated, undefined, reviewedByName)),
				patchElements(applicationsTableBody(applications)),
			);
		},

		async history(id: string): Promise<Response> {
			const { events } = await eventStore.readStream<ApplicationEvent>(
				`application-${id}`,
			);
			if (events.length === 0)
				return sseResponse(patchElements(applicationHistoryPanel([])));

			const volunteerIds = new Set(
				events
					.filter(
						(
							e,
						): e is Extract<
							ApplicationEvent,
							{ type: "ApplicationConfirmed" | "ApplicationRejected" }
						> =>
							e.type === "ApplicationConfirmed" ||
							e.type === "ApplicationRejected",
					)
					.map((e) => e.data.volunteerId)
					.filter((vid): vid is string => !!vid),
			);

			const volunteerNames = new Map<string, string>();
			for (const vid of volunteerIds) {
				const vol = await volunteerRepo.getById(vid);
				if (vol) volunteerNames.set(vid, vol.name);
			}

			const entries = extractReviewHistory(events, volunteerNames);
			return sseResponse(patchElements(applicationHistoryPanel(entries)));
		},

		closePanel(): Response {
			return sseResponse(patchElements('<div id="panel"></div>'));
		},

		async handleRevertReview(
			applicationId: string,
			volunteerId: string,
		): Promise<Response> {
			const app = await appRepo.getById(applicationId);
			if (!app) return new Response("Not found", { status: 404 });

			await revertReviewApplication(applicationId, volunteerId, eventStore);

			const updated = await appRepo.getById(applicationId);
			if (!updated) return new Response("Not found", { status: 404 });

			const applicant =
				updated.phone && updated.name
					? await applicantRepo.getByPhoneAndName(updated.phone, updated.name)
					: null;
			const reviewedByName = await resolveReviewedBy(updated, volunteerRepo);
			const applications = await appRepo.listByMonth(app.monthCycle);
			return sseResponse(
				patchElements(
					reviewPanel(updated, applicant?.id ?? null, reviewedByName),
				),
				patchElements(applicationsTableBody(applications)),
			);
		},
	};
}

async function resolveReviewedBy(
	app: { status: string; reviewedByVolunteerId: string | null },
	volunteerRepo: VolunteerRepository,
): Promise<string | null> {
	if (!app.reviewedByVolunteerId) return null;
	const vol = await volunteerRepo.getById(app.reviewedByVolunteerId);
	return vol?.name ?? null;
}
