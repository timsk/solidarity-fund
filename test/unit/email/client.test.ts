import { describe, expect, mock, test } from "bun:test";
import { resetEmailConfig } from "../../../src/config.ts";

// Mock nodemailer — bun's mock.module intercepts at module loader level
type SendMailResult = { accepted: string[]; messageId: string };
const mockSendMail = mock<(opts: unknown) => Promise<SendMailResult>>();
mockSendMail.mockResolvedValue({
	accepted: ["to@test.com"],
	messageId: "msg-1",
});

mock.module("nodemailer", () => ({
	default: {
		createTransport: () => ({
			sendMail: mockSendMail,
		}),
	},
}));

import {
	createEmailClient,
	NullEmailClient,
	SmtpEmailClient,
} from "../../../src/infrastructure/email/client.ts";

describe("NullEmailClient", () => {
	test("send returns success true", async () => {
		const client = new NullEmailClient();
		const result = await client.send();
		expect(result).toEqual({ success: true });
	});

	test("send with params ignores input and returns success true", async () => {
		const client = new NullEmailClient();
		const result = await client.send({
			to: "anyone@test.com",
			subject: "anything",
			html: "<p>irrelevant</p>",
		});
		expect(result).toEqual({ success: true });
	});
});

describe("SmtpEmailClient", () => {
	test("successful send returns success true with messageId", async () => {
		const client = new SmtpEmailClient("me@gmail.com", "app-password");
		const result = await client.send({
			to: "you@test.com",
			subject: "hello",
			html: "<p>hi</p>",
		});
		expect(result).toEqual({ success: true, messageId: "msg-1" });
	});

	test("no accepted recipients returns error", async () => {
		mockSendMail.mockResolvedValueOnce({ accepted: [], messageId: "" });
		const client = new SmtpEmailClient("me@gmail.com", "app-password");
		const result = await client.send({
			to: "nowhere@test.com",
			subject: "hello",
			html: "<p>hi</p>",
		});
		expect(result.success).toBe(false);
		expect(result.error).toBe("No recipients accepted the message");
	});

	test("uses fromName when provided", async () => {
		const client = new SmtpEmailClient(
			"me@gmail.com",
			"app-password",
			"My Fund",
		);
		await client.send({
			to: "you@test.com",
			subject: "hello",
			html: "<p>hi</p>",
		});
		expect(mockSendMail).toHaveBeenCalledWith(
			expect.objectContaining({ from: "My Fund" }),
		);
	});

	test("falls back to user when fromName is not provided", async () => {
		const client = new SmtpEmailClient("me@gmail.com", "app-password");
		await client.send({
			to: "you@test.com",
			subject: "hello",
			html: "<p>hi</p>",
		});
		expect(mockSendMail).toHaveBeenCalledWith(
			expect.objectContaining({ from: "me@gmail.com" }),
		);
	});
});

describe("createEmailClient", () => {
	test("returns SmtpEmailClient when config.enabled is true", () => {
		const client = createEmailClient({
			enabled: true,
			user: "test@test.com",
			appPassword: "secret",
		});
		expect(client).toBeInstanceOf(SmtpEmailClient);
	});

	test("returns NullEmailClient when config.enabled is false", () => {
		const client = createEmailClient({
			enabled: false,
			user: "",
			appPassword: "",
		});
		expect(client).toBeInstanceOf(NullEmailClient);
	});

	test("calls getEmailConfig when no config passed (enabled path)", () => {
		resetEmailConfig();
		process.env.EMAIL_ENABLED = "true";
		process.env.GMAIL_USER = "env@test.com";
		process.env.GMAIL_APP_PASSWORD = "env-pass";
		try {
			const client = createEmailClient();
			expect(client).toBeInstanceOf(SmtpEmailClient);
		} finally {
			delete process.env.EMAIL_ENABLED;
			delete process.env.GMAIL_USER;
			delete process.env.GMAIL_APP_PASSWORD;
			resetEmailConfig();
		}
	});

	test("calls getEmailConfig when no config passed (disabled path)", () => {
		resetEmailConfig();
		process.env.EMAIL_ENABLED = "false";
		try {
			const client = createEmailClient();
			expect(client).toBeInstanceOf(NullEmailClient);
		} finally {
			delete process.env.EMAIL_ENABLED;
			resetEmailConfig();
		}
	});
});
