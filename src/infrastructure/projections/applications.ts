import { sqliteProjection } from "@event-driven-io/emmett-sqlite";
import type { ApplicationEvent } from "../../domain/application/types.ts";

export const applicationsProjection = sqliteProjection<ApplicationEvent>({
	canHandle: [
		"ApplicationSubmitted",
		"ApplicationAccepted",
		"ApplicationConfirmed",
		"ApplicationRejected",
		"ApplicationFlaggedForReview",
		"ApplicationSelected",
		"ApplicationNotSelected",
		"ApplicationLotteryCancelled",
		"ApplicationReviewReverted",
	],

	init: async ({ context: { connection } }) => {
		await connection.command(`
			CREATE TABLE IF NOT EXISTS applications (
				ref TEXT NOT NULL UNIQUE,
				id TEXT NOT NULL UNIQUE,
				applicant_id TEXT NOT NULL,
				lottery_name TEXT NOT NULL,
				status TEXT NOT NULL,
				rank INTEGER,
				payment_preference TEXT NOT NULL,
				name TEXT,
				phone TEXT,
				reject_reason TEXT,
				applied_at TEXT,
				accepted_at TEXT,
				selected_at TEXT,
				rejected_at TEXT,
				reviewed_by_volunteer_id TEXT,
				email TEXT,
				meeting_place TEXT,
				sort_code TEXT,
				account_number TEXT,
				poa_ref TEXT
			)
		`);
		try {
			await connection.command(
				"ALTER TABLE applications ADD COLUMN reviewed_by_volunteer_id TEXT",
			);
		} catch {
			// Column already exists (added by CREATE TABLE IF NOT EXISTS above)
		}
		try {
			await connection.command(
				"ALTER TABLE applications RENAME COLUMN month_cycle TO lottery_name",
			);
		} catch {
			// Column already renamed or doesn't exist
		}
	},

	handle: async (events, { connection }) => {
		for (const { type, data } of events) {
			switch (type) {
				case "ApplicationSubmitted":
					await connection.command(
						`INSERT OR IGNORE INTO applications
						   (ref, id, applicant_id, lottery_name, status, payment_preference, name, phone, email, meeting_place, applied_at, sort_code, account_number, poa_ref)
						 VALUES (?, ?, ?, ?, 'applied', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
						[
							data.applicationId.slice(0, 8),
							data.applicationId,
							data.applicantId,
							data.lotteryName,
							data.paymentPreference,
							data.identity.name,
							data.identity.phone,
							data.identity.email ?? null,
							data.meetingDetails?.place ?? null,
							data.submittedAt,
							data.bankDetails?.sortCode ?? null,
							data.bankDetails?.accountNumber ?? null,
							data.bankDetails?.proofOfAddressRef ?? null,
						],
					);
					break;
				case "ApplicationAccepted":
					await connection.command(
						"UPDATE applications SET status = 'accepted', accepted_at = ? WHERE id = ?",
						[data.acceptedAt, data.applicationId],
					);
					break;
				case "ApplicationConfirmed":
					await connection.command(
						"UPDATE applications SET status = 'confirmed', accepted_at = ?, applicant_id = ?, reviewed_by_volunteer_id = ? WHERE id = ?",
						[
							data.confirmedAt,
							data.applicantId,
							data.volunteerId,
							data.applicationId,
						],
					);
					break;
				case "ApplicationRejected":
					await connection.command(
						"UPDATE applications SET status = 'rejected', reject_reason = ?, rejected_at = ?, reviewed_by_volunteer_id = ? WHERE id = ?",
						[
							data.reason,
							data.rejectedAt,
							data.volunteerId ?? null,
							data.applicationId,
						],
					);
					break;
				case "ApplicationFlaggedForReview":
					await connection.command(
						"UPDATE applications SET status = 'flagged' WHERE id = ?",
						[data.applicationId],
					);
					break;
				case "ApplicationSelected":
					await connection.command(
						"UPDATE applications SET status = 'selected', rank = ?, selected_at = ? WHERE id = ?",
						[data.rank, data.selectedAt, data.applicationId],
					);
					break;
				case "ApplicationNotSelected":
					await connection.command(
						"UPDATE applications SET status = 'not_selected' WHERE id = ?",
						[data.applicationId],
					);
					break;
				case "ApplicationLotteryCancelled":
					await connection.command(
						"UPDATE applications SET status = 'cancelled', rank = NULL, selected_at = NULL WHERE id = ?",
						[data.applicationId],
					);
					break;
				case "ApplicationReviewReverted":
					await connection.command(
						"UPDATE applications SET status = 'flagged', reviewed_by_volunteer_id = ?, reject_reason = NULL, rejected_at = NULL, accepted_at = NULL WHERE id = ?",
						[data.volunteerId, data.applicationId],
					);
					break;
			}
		}
	},
});
