import { CommandHandler } from "@event-driven-io/emmett";
import type { SQLiteEventStore } from "@event-driven-io/emmett-sqlite";
import { createApplicant } from "../applicant/commandHandlers.ts";
import type { ApplicantRepository } from "../applicant/repository.ts";
import { decide, evolve, initialState } from "./decider.ts";
import { resolveIdentity } from "./resolveIdentity.ts";
import type {
	ApplicationEvent,
	EligibilityResult,
	PaymentPreference,
	SubmitApplication,
} from "./types.ts";

export type ApplicationFormData = {
	applicationId: string;
	phone: string;
	name: string;
	email?: string;
	paymentPreference: PaymentPreference;
	meetingPlace?: string;
	lotteryName: string;
	eligibility: EligibilityResult;
	bankDetails?: {
		sortCode: string;
		accountNumber: string;
		proofOfAddressRef: string;
	};
};

const handle = CommandHandler<
	ReturnType<typeof initialState>,
	ApplicationEvent
>({ evolve, initialState });

export async function submitApplication(
	form: ApplicationFormData,
	eventStore: SQLiteEventStore,
	applicantRepo: ApplicantRepository,
): Promise<{ streamId: string; events: ApplicationEvent[] }> {
	const identityResolution = await resolveIdentity(
		form.phone,
		form.name,
		applicantRepo,
	);

	const command: SubmitApplication = {
		type: "SubmitApplication",
		data: {
			applicationId: form.applicationId,
			identity: {
				phone: form.phone,
				name: form.name,
				email: form.email,
			},
			paymentPreference: form.paymentPreference,
			meetingDetails: form.meetingPlace
				? { place: form.meetingPlace }
				: undefined,
			lotteryName: form.lotteryName,
			identityResolution,
			eligibility: form.eligibility,
			submittedAt: new Date().toISOString(),
			bankDetails: form.bankDetails,
		},
	};

	const streamId = `application-${form.applicationId}`;
	const { newEvents } = await handle(eventStore, streamId, (state) =>
		decide(command, state),
	);

	if (identityResolution.type === "new") {
		try {
			await createApplicant(
				{
					phone: form.phone,
					name: form.name,
					email: form.email,
				},
				eventStore,
			);
		} catch {
			// Applicant already exists (race condition) — safe to ignore
		}
	}

	return { streamId, events: newEvents };
}
