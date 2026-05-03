import { sqliteProjection } from "@event-driven-io/emmett-sqlite";
import type { GrantEvent } from "../../domain/grant/types.ts";

export const grantProjection = sqliteProjection<GrantEvent>({
	canHandle: [
		"GrantCreated",
		"VolunteerAssigned",
		"BankDetailsUpdated",
		"ProofOfAddressApproved",
		"ProofOfAddressRejected",
		"CashAlternativeOffered",
		"CashAlternativeAccepted",
		"CashAlternativeDeclined",
		"GrantPaid",
		"SlotReleased",
		"VolunteerReimbursed",
	],

	init: async ({ context: { connection } }) => {
		await connection.command(`
			CREATE TABLE IF NOT EXISTS grants (
				id TEXT PRIMARY KEY,
				application_id TEXT NOT NULL,
				applicant_id TEXT NOT NULL,
				lottery_name TEXT NOT NULL,
				rank INTEGER NOT NULL,
				status TEXT NOT NULL,
				payment_preference TEXT NOT NULL,
				sort_code TEXT,
				account_number TEXT,
				poa_ref TEXT,
				volunteer_id TEXT,
				poa_attempts INTEGER NOT NULL DEFAULT 0,
				amount INTEGER,
				payment_method TEXT,
				paid_by TEXT,
				paid_at TEXT,
				expense_reference TEXT,
				reimbursed_at TEXT,
				released_reason TEXT,
				released_at TEXT,
				notes TEXT,
				created_at TEXT NOT NULL,
				updated_at TEXT NOT NULL
			)
		`);
		// Migration: add notes column to existing databases
		// (CREATE TABLE above already includes it for fresh installs)
		try {
			await connection.command("ALTER TABLE grants ADD COLUMN notes TEXT");
		} catch (e) {
			if (!(e instanceof Error && e.message.includes("duplicate column")))
				throw e;
		}

	},

	handle: async (events, { connection }) => {
		for (const { type, data } of events) {
			switch (type) {
				case "GrantCreated": {
					const status =
						data.paymentPreference === "bank"
							? "awaiting_review"
							: "awaiting_cash_handover";
					await connection.command(
						`INSERT OR IGNORE INTO grants (id, application_id, applicant_id, lottery_name, rank, status, payment_preference, sort_code, account_number, poa_ref, created_at, updated_at)
						 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
						[
							data.grantId,
							data.applicationId,
							data.applicantId,
							data.lotteryName,
							data.rank,
							status,
							data.paymentPreference,
							data.bankDetails?.sortCode ?? null,
							data.bankDetails?.accountNumber ?? null,
							data.bankDetails?.proofOfAddressRef ?? null,
							data.createdAt,
							data.createdAt,
						],
					);
					break;
				}
				case "VolunteerAssigned":
					await connection.command(
						"UPDATE grants SET volunteer_id = ?, updated_at = ? WHERE id = ?",
						[data.volunteerId, data.assignedAt, data.grantId],
					);
					break;
				case "BankDetailsUpdated":
					await connection.command(
						"UPDATE grants SET sort_code = ?, account_number = ?, updated_at = ? WHERE id = ?",
						[data.sortCode, data.accountNumber, data.updatedAt, data.grantId],
					);
					break;
				case "ProofOfAddressApproved":
					await connection.command(
						"UPDATE grants SET status = 'poa_approved', updated_at = ? WHERE id = ?",
						[data.verifiedAt, data.grantId],
					);
					break;
				case "ProofOfAddressRejected":
					await connection.command(
						"UPDATE grants SET poa_attempts = poa_attempts + 1, updated_at = ? WHERE id = ?",
						[data.rejectedAt, data.grantId],
					);
					break;
				case "CashAlternativeOffered":
					await connection.command(
						"UPDATE grants SET status = 'offered_cash_alternative', updated_at = ? WHERE id = ?",
						[data.offeredAt, data.grantId],
					);
					break;
				case "CashAlternativeAccepted":
					await connection.command(
						"UPDATE grants SET status = 'awaiting_cash_handover', updated_at = ? WHERE id = ?",
						[data.acceptedAt, data.grantId],
					);
					break;
				case "CashAlternativeDeclined":
					break;
				case "GrantPaid": {
					const grantStatus =
						data.method === "cash" ? "awaiting_reimbursement" : "paid";
					await connection.command(
						"UPDATE grants SET status = ?, amount = ?, payment_method = ?, paid_by = ?, paid_at = ?, updated_at = ? WHERE id = ?",
						[
							grantStatus,
							data.amount,
							data.method,
							data.paidBy,
							data.paidAt,
							data.paidAt,
							data.grantId,
						],
					);
					break;
				}
				case "VolunteerReimbursed":
					await connection.command(
						"UPDATE grants SET status = 'reimbursed', expense_reference = ?, reimbursed_at = ?, updated_at = ? WHERE id = ?",
						[
							data.expenseReference,
							data.reimbursedAt,
							data.reimbursedAt,
							data.grantId,
						],
					);
					break;
				case "SlotReleased":
					await connection.command(
						"UPDATE grants SET status = 'released', released_reason = ?, released_at = ?, updated_at = ? WHERE id = ?",
						[data.reason, data.releasedAt, data.releasedAt, data.grantId],
					);
					break;
			}
		}
	},
});
