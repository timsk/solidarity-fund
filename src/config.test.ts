import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { getCooldownDays, resetCooldownDays } from "./config.ts";

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
