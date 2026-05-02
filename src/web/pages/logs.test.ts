// src/web/pages/logs.test.ts
import { describe, expect, it } from "bun:test";
import { describeEvent } from "./logs.ts";

describe("describeEvent", () => {
	it("ApplicationSubmitted uses first 8 chars of applicationId", () => {
		const result = describeEvent("ApplicationSubmitted", {
			applicationId: "abcdef1234567890",
		});
		expect(result).toContain("abcdef12");
		expect(result).toContain("submitted");
	});

	it("ApplicationAccepted", () => {
		const result = describeEvent("ApplicationAccepted", {
			applicationId: "abcdef1234567890",
		});
		expect(result).toContain("abcdef12");
		expect(result).toContain("accepted");
	});

	it("ApplicationRejected includes reason", () => {
		const result = describeEvent("ApplicationRejected", {
			applicationId: "abcdef1234567890",
			reason: "does not meet criteria",
		});
		expect(result).toContain("abcdef12");
		expect(result).toContain("rejected");
		expect(result).toContain("does not meet criteria");
	});

	it("ApplicationFlaggedForReview includes reason", () => {
		const result = describeEvent("ApplicationFlaggedForReview", {
			applicationId: "aabbccdd11223344",
			reason: "suspected duplicate",
		});
		expect(result).toContain("aabbccdd");
		expect(result).toContain("flagged");
		expect(result).toContain("suspected duplicate");
	});

	it("ApplicationSelected includes rank", () => {
		const result = describeEvent("ApplicationSelected", {
			applicationId: "aabbccdd11223344",
			rank: 3,
		});
		expect(result).toContain("aabbccdd");
		expect(result).toContain("selected");
		expect(result).toContain("3");
	});

	it("ApplicationNotSelected", () => {
		const result = describeEvent("ApplicationNotSelected", {
			applicationId: "aabbccdd11223344",
		});
		expect(result).toContain("aabbccdd");
		expect(result).toContain("not selected");
	});

	it("ApplicationConfirmed", () => {
		const result = describeEvent("ApplicationConfirmed", {
			applicationId: "aabbccdd11223344",
		});
		expect(result).toContain("aabbccdd");
		expect(result).toContain("confirmed");
	});

	it("ApplicationConfirmed includes volunteer name when available", () => {
		const names = new Map([["vol-1", "Jane Smith"]]);
		const result = describeEvent(
			"ApplicationConfirmed",
			{ applicationId: "aabbccdd11223344", volunteerId: "vol-1" },
			names,
		);
		expect(result).toContain("confirmed by");
		expect(result).toContain("Jane Smith");
	});

	it("ApplicationConfirmed with unknown volunteerId shows no name", () => {
		const names = new Map([["vol-1", "Jane Smith"]]);
		const result = describeEvent(
			"ApplicationConfirmed",
			{ applicationId: "aabbccdd11223344", volunteerId: "vol-unknown" },
			names,
		);
		expect(result).not.toContain("by");
	});

	it("ApplicationConfirmed with empty volunteerId shows no name", () => {
		const names = new Map([["vol-1", "Jane Smith"]]);
		const result = describeEvent(
			"ApplicationConfirmed",
			{ applicationId: "aabbccdd11223344", volunteerId: "" },
			names,
		);
		expect(result).not.toContain("by");
	});

	it("ApplicationReviewReverted includes volunteer name", () => {
		const names = new Map([["vol-2", "Alex Kim"]]);
		const result = describeEvent(
			"ApplicationReviewReverted",
			{ applicationId: "abc12345", volunteerId: "vol-2" },
			names,
		);
		expect(result).toContain("reverted");
		expect(result).toContain("Alex Kim");
	});

	it("ApplicationRejected includes volunteer name when provided", () => {
		const names = new Map([["vol-3", "Sam Jones"]]);
		const result = describeEvent(
			"ApplicationRejected",
			{
				applicationId: "abcdef1234567890",
				reason: "cooldown",
				volunteerId: "vol-3",
			},
			names,
		);
		expect(result).toContain("rejected");
		expect(result).toContain("Sam Jones");
	});

	it("GrantPaid includes volunteer name", () => {
		const names = new Map([["vol-4", "Maria Garcia"]]);
		const result = describeEvent(
			"GrantPaid",
			{ amount: 375, method: "bank", paidBy: "vol-4" },
			names,
		);
		expect(result).toContain("375");
		expect(result).toContain("bank");
		expect(result).toContain("Maria Garcia");
	});

	it("VolunteerAssigned includes volunteer name", () => {
		const names = new Map([["vol-5", "Priya Patel"]]);
		const result = describeEvent(
			"VolunteerAssigned",
			{ volunteerId: "vol-5" },
			names,
		);
		expect(result).toContain("Priya Patel");
		expect(result).toContain("assigned");
	});

	it("ProofOfAddressApproved includes verifier name", () => {
		const names = new Map([["vol-6", "Bob Wilson"]]);
		const result = describeEvent(
			"ProofOfAddressApproved",
			{ verifiedBy: "vol-6" },
			names,
		);
		expect(result).toContain("approved");
		expect(result).toContain("Bob Wilson");
	});

	it("ApplicantCreated includes name", () => {
		const result = describeEvent("ApplicantCreated", { name: "Maria Santos" });
		expect(result).toContain("Maria Santos");
		expect(result).toContain("created");
	});

	it("ApplicantUpdated includes name", () => {
		const result = describeEvent("ApplicantUpdated", { name: "Maria Santos" });
		expect(result).toContain("Maria Santos");
		expect(result).toContain("updated");
	});

	it("ApplicantDeleted", () => {
		const result = describeEvent("ApplicantDeleted", {});
		expect(result).toContain("deleted");
	});

	it("VolunteerCreated includes name", () => {
		const result = describeEvent("VolunteerCreated", { name: "Alex Kim" });
		expect(result).toContain("Alex Kim");
		expect(result).toContain("created");
	});

	it("VolunteerUpdated includes name", () => {
		const result = describeEvent("VolunteerUpdated", { name: "Alex Kim" });
		expect(result).toContain("Alex Kim");
		expect(result).toContain("updated");
	});

	it("VolunteerDisabled", () => {
		expect(describeEvent("VolunteerDisabled", {})).toContain("disabled");
	});

	it("VolunteerEnabled", () => {
		expect(describeEvent("VolunteerEnabled", {})).toContain("re-enabled");
	});

	it("PasswordChanged", () => {
		expect(describeEvent("PasswordChanged", {})).toContain("Password changed");
	});

	it("GrantCreated includes paymentPreference", () => {
		const result = describeEvent("GrantCreated", {
			paymentPreference: "bank_transfer",
		});
		expect(result).toContain("bank_transfer");
	});

	it("GrantPaid includes amount and method", () => {
		const result = describeEvent("GrantPaid", {
			amount: 350,
			method: "bank_transfer",
		});
		expect(result).toContain("350");
		expect(result).toContain("bank_transfer");
	});

	it("SlotReleased includes reason", () => {
		const result = describeEvent("SlotReleased", {
			reason: "applicant withdrew",
		});
		expect(result).toContain("applicant withdrew");
	});

	it("LotteryDrawn includes selected count, amount, lotteryName", () => {
		const result = describeEvent("LotteryDrawn", {
			selected: ["a", "b", "c"],
			grantAmount: 300,
			lotteryName: "2026-02",
		});
		expect(result).toContain("3");
		expect(result).toContain("300");
		expect(result).toContain("2026-02");
	});

	it("ApplicationWindowOpened includes lotteryName", () => {
		const result = describeEvent("ApplicationWindowOpened", {
			lotteryName: "2026-03",
		});
		expect(result).toContain("opened");
		expect(result).toContain("2026-03");
	});

	it("ApplicationWindowClosed includes lotteryName", () => {
		const result = describeEvent("ApplicationWindowClosed", {
			lotteryName: "2026-03",
		});
		expect(result).toContain("closed");
		expect(result).toContain("2026-03");
	});

	it("VolunteerAssigned", () => {
		expect(describeEvent("VolunteerAssigned", {})).toContain("assigned");
	});

	it("BankDetailsUpdated", () => {
		expect(describeEvent("BankDetailsUpdated", {})).toContain("Bank details");
	});

	it("ProofOfAddressApproved", () => {
		expect(describeEvent("ProofOfAddressApproved", {})).toContain("approved");
	});

	it("ProofOfAddressRejected includes reason", () => {
		const result = describeEvent("ProofOfAddressRejected", {
			reason: "blurry",
		});
		expect(result).toContain("rejected");
		expect(result).toContain("blurry");
	});

	it("CashAlternativeOffered", () => {
		expect(describeEvent("CashAlternativeOffered", {})).toContain("offered");
	});

	it("CashAlternativeAccepted", () => {
		expect(describeEvent("CashAlternativeAccepted", {})).toContain("accepted");
	});

	it("CashAlternativeDeclined", () => {
		expect(describeEvent("CashAlternativeDeclined", {})).toContain("declined");
	});

	it("VolunteerReimbursed includes expenseReference", () => {
		const result = describeEvent("VolunteerReimbursed", {
			expenseReference: "EXP-001",
		});
		expect(result).toContain("EXP-001");
	});

	it("unknown event type returns empty string", () => {
		expect(describeEvent("SomeUnknownEvent", {})).toBe("");
	});

	it("escapes HTML in user-supplied values", () => {
		const result = describeEvent("ApplicantCreated", {
			name: '<script>alert("xss")</script>',
		});
		expect(result).not.toContain("<script>");
		expect(result).toContain("&lt;script&gt;");
	});

	it("escapes HTML in reason field", () => {
		const result = describeEvent("ApplicationRejected", {
			applicationId: "abcdef1234567890",
			reason: '<script>alert("xss")</script>',
		});
		expect(result).not.toContain("<script>");
		expect(result).toContain("&lt;script&gt;");
	});

	it("handles missing fields gracefully (no crash)", () => {
		expect(() => describeEvent("ApplicationSubmitted", {})).not.toThrow();
		expect(() => describeEvent("ApplicationRejected", {})).not.toThrow();
	});
});
