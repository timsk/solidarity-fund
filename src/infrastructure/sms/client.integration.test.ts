import { afterEach, beforeEach, expect, test } from "bun:test";
import { ClickSendSmsClient } from "./client.ts";

let server: ReturnType<typeof Bun.serve>;
let capturedRequest: Request | null = null;

beforeEach(() => {
	capturedRequest = null;
	server = Bun.serve({
		port: 0,
		async fetch(req) {
			capturedRequest = req.clone();
			return new Response(
				JSON.stringify({
					http_code: 200,
					response_msg: "OK",
					data: {
						messages: [
							{
								to: "+61422222222",
								message_id: "mock-msg-123",
								status: "SUCCESS",
							},
						],
					},
				}),
				{ status: 200, headers: { "Content-Type": "application/json" } },
			);
		},
	});
});

afterEach(() => {
	server.stop(true);
});

test("ClickSendSmsClient sends correct payload to mock server", async () => {
	const client = new ClickSendSmsClient(
		"user",
		"key",
		`http://127.0.0.1:${server.port}`,
	);
	const result = await client.send({ to: "+61422222222", body: "Hello" });

	expect(capturedRequest).not.toBeNull();
	expect(capturedRequest?.method).toBe("POST");
	expect(capturedRequest?.headers.get("Authorization")).toBe(
		`Basic ${btoa("user:key")}`,
	);
	expect(result.success).toBe(true);
	expect(result.messageId).toBe("mock-msg-123");
});
