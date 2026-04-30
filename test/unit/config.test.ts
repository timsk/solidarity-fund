import { describe, expect, test } from "bun:test";
import {
	getEmailConfig,
	getFundName,
	resetEmailConfig,
	resetSmsConfig,
	setFundName,
} from "../../src/config.ts";

describe("config", () => {
	test("default fund name", () => {
		expect(getFundName()).toBe("Community Solidarity Fund");
	});

	test("setFundName overrides default", () => {
		setFundName("Test Fund");
		expect(getFundName()).toBe("Test Fund");
		setFundName("Community Solidarity Fund");
	});
});

describe("email config", () => {
	test("returns disabled when EMAIL_ENABLED is not true", () => {
		using _ = withEmailEnv({ EMAIL_ENABLED: "false" });
		expect(getEmailConfig().enabled).toBe(false);
	});

	test("returns disabled when EMAIL_ENABLED is unset", () => {
		using _ = withEmailEnv({});
		expect(getEmailConfig().enabled).toBe(false);
	});

	test("parses enabled with valid credentials", () => {
		using _ = withEmailEnv({
			EMAIL_ENABLED: "true",
			GMAIL_USER: "user@gmail.com",
			GMAIL_APP_PASSWORD: "app-password",
		});
		const config = getEmailConfig();
		expect(config.enabled).toBe(true);
		expect(config.user).toBe("user@gmail.com");
		expect(config.appPassword).toBe("app-password");
	});

	test("uses EMAIL_USER as default fromName", () => {
		using _ = withEmailEnv({
			EMAIL_ENABLED: "true",
			GMAIL_USER: "user@gmail.com",
			GMAIL_APP_PASSWORD: "app-password",
		});
		expect(getEmailConfig().fromName).toBe("user@gmail.com");
	});

	test("uses EMAIL_FROM_NAME when provided", () => {
		using _ = withEmailEnv({
			EMAIL_ENABLED: "true",
			GMAIL_USER: "user@gmail.com",
			GMAIL_APP_PASSWORD: "app-password",
			EMAIL_FROM_NAME: "Solidarity Fund",
		});
		expect(getEmailConfig().fromName).toBe("Solidarity Fund");
	});

	test("throws when GMAIL_USER is missing and enabled", () => {
		using _ = withEmailEnv({
			EMAIL_ENABLED: "true",
			GMAIL_APP_PASSWORD: "app-password",
		});
		expect(() => getEmailConfig()).toThrow(
			"GMAIL_USER and GMAIL_APP_PASSWORD are required when EMAIL_ENABLED=true",
		);
	});

	test("throws when GMAIL_APP_PASSWORD is missing and enabled", () => {
		using _ = withEmailEnv({
			EMAIL_ENABLED: "true",
			GMAIL_USER: "user@gmail.com",
		});
		expect(() => getEmailConfig()).toThrow(
			"GMAIL_USER and GMAIL_APP_PASSWORD are required when EMAIL_ENABLED=true",
		);
	});

	test("resetEmailConfig clears cache", () => {
		resetEmailConfig();
		using _ = withEmailEnv({
			EMAIL_ENABLED: "true",
			GMAIL_USER: "user@gmail.com",
			GMAIL_APP_PASSWORD: "app-password",
		});
		const config = getEmailConfig();
		expect(config.enabled).toBe(true);
		resetEmailConfig();
		using _2 = withEmailEnv({ EMAIL_ENABLED: "false" });
		expect(getEmailConfig().enabled).toBe(false);
	});

	test("fromName is undefined when disabled and no env vars set", () => {
		using _ = withEmailEnv({ EMAIL_ENABLED: "false" });
		expect(getEmailConfig().fromName).toBeUndefined();
	});
});

function withEmailEnv(vars: Record<string, string>) {
	const previous = { ...process.env };
	for (const [k, v] of Object.entries(vars)) {
		process.env[k] = v;
	}
	resetEmailConfig();
	return {
		[Symbol.dispose]() {
			for (const k of Object.keys(vars)) {
				if (previous[k] === undefined) {
					delete process.env[k];
				} else {
					process.env[k] = previous[k];
				}
			}
			resetEmailConfig();
		},
	};
}
