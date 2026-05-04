import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
	getAutoApproveConfig,
	getBaseUrl,
	getCooldownDays,
	resetAutoApproveConfig,
	resetBaseUrl,
	resetCooldownDays,
} from "./config.ts";

describe("getAutoApproveConfig", () => {
	let saved: string | undefined;

	beforeEach(() => {
		saved = process.env.AUTO_APPROVE_ELIGIBLE;
		resetAutoApproveConfig();
	});

	afterEach(() => {
		if (saved === undefined) {
			delete process.env.AUTO_APPROVE_ELIGIBLE;
		} else {
			process.env.AUTO_APPROVE_ELIGIBLE = saved;
		}
		resetAutoApproveConfig();
	});

	it("returns enabled=true when AUTO_APPROVE_ELIGIBLE is unset", () => {
		delete process.env.AUTO_APPROVE_ELIGIBLE;
		resetAutoApproveConfig();
		expect(getAutoApproveConfig().enabled).toBe(true);
	});

	it("returns enabled=true when AUTO_APPROVE_ELIGIBLE=true", () => {
		process.env.AUTO_APPROVE_ELIGIBLE = "true";
		resetAutoApproveConfig();
		expect(getAutoApproveConfig().enabled).toBe(true);
	});

	it("returns enabled=false when AUTO_APPROVE_ELIGIBLE=false", () => {
		process.env.AUTO_APPROVE_ELIGIBLE = "false";
		resetAutoApproveConfig();
		expect(getAutoApproveConfig().enabled).toBe(false);
	});

	it("resetAutoApproveConfig clears cache so next call re-reads env", () => {
		process.env.AUTO_APPROVE_ELIGIBLE = "true";
		resetAutoApproveConfig();
		expect(getAutoApproveConfig().enabled).toBe(true);

		process.env.AUTO_APPROVE_ELIGIBLE = "false";
		// Without reset, cached value (true) should still return
		expect(getAutoApproveConfig().enabled).toBe(true);

		resetAutoApproveConfig();
		expect(getAutoApproveConfig().enabled).toBe(false);
	});
});

describe("getCooldownDays", () => {
	let saved: string | undefined;

	beforeEach(() => {
		saved = process.env.COOLDOWN_DAYS;
		resetCooldownDays();
	});

	afterEach(() => {
		if (saved === undefined) {
			delete process.env.COOLDOWN_DAYS;
		} else {
			process.env.COOLDOWN_DAYS = saved;
		}
		resetCooldownDays();
	});

	it("returns default 90 when COOLDOWN_DAYS is unset", () => {
		delete process.env.COOLDOWN_DAYS;
		resetCooldownDays();
		expect(getCooldownDays()).toBe(90);
	});

	it("returns parsed value when set to a valid number", () => {
		process.env.COOLDOWN_DAYS = "30";
		resetCooldownDays();
		expect(getCooldownDays()).toBe(30);
	});

	it("accepts large values", () => {
		process.env.COOLDOWN_DAYS = "365";
		resetCooldownDays();
		expect(getCooldownDays()).toBe(365);
	});

	it("throws on non-numeric value", () => {
		process.env.COOLDOWN_DAYS = "abc";
		resetCooldownDays();
		expect(() => getCooldownDays()).toThrow(
			"COOLDOWN_DAYS must be a positive integer",
		);
	});

	it("throws on zero", () => {
		process.env.COOLDOWN_DAYS = "0";
		resetCooldownDays();
		expect(() => getCooldownDays()).toThrow(
			"COOLDOWN_DAYS must be a positive integer",
		);
	});

	it("throws on negative", () => {
		process.env.COOLDOWN_DAYS = "-5";
		resetCooldownDays();
		expect(() => getCooldownDays()).toThrow(
			"COOLDOWN_DAYS must be a positive integer",
		);
	});

	it("throws on float", () => {
		process.env.COOLDOWN_DAYS = "30.5";
		resetCooldownDays();
		expect(() => getCooldownDays()).toThrow(
			"COOLDOWN_DAYS must be a positive integer",
		);
	});

	it("resetCooldownDays clears cache so next call re-reads env", () => {
		process.env.COOLDOWN_DAYS = "15";
		resetCooldownDays();
		expect(getCooldownDays()).toBe(15);

		process.env.COOLDOWN_DAYS = "60";
		// Without reset, cached value (15) should still return
		expect(getCooldownDays()).toBe(15);

		resetCooldownDays();
		expect(getCooldownDays()).toBe(60);
	});
});

describe("getBaseUrl", () => {
	let saved: string | undefined;

	beforeEach(() => {
		saved = process.env.BASE_URL;
		resetBaseUrl();
	});

	afterEach(() => {
		if (saved === undefined) {
			delete process.env.BASE_URL;
		} else {
			process.env.BASE_URL = saved;
		}
		resetBaseUrl();
	});

	it("returns empty string when BASE_URL is unset", () => {
		delete process.env.BASE_URL;
		resetBaseUrl();
		expect(getBaseUrl()).toBe("");
	});

	it("returns the env value when BASE_URL is set", () => {
		process.env.BASE_URL = "https://example.com";
		resetBaseUrl();
		expect(getBaseUrl()).toBe("https://example.com");
	});

	it("returns cached value without re-reading env", () => {
		process.env.BASE_URL = "https://first.com";
		resetBaseUrl();
		expect(getBaseUrl()).toBe("https://first.com");

		process.env.BASE_URL = "https://second.com";
		expect(getBaseUrl()).toBe("https://first.com");
	});

	it("resetBaseUrl clears cache so next call re-reads env", () => {
		process.env.BASE_URL = "https://first.com";
		resetBaseUrl();
		expect(getBaseUrl()).toBe("https://first.com");

		process.env.BASE_URL = "https://second.com";
		resetBaseUrl();
		expect(getBaseUrl()).toBe("https://second.com");
	});
});
