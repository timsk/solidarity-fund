// src/web/routes/logs.test.ts
import { describe, expect, it } from "bun:test";
import { calcOffset, calcTotalPages, parsePage } from "./utils.ts";

describe("parsePage", () => {
	it("defaults to 1 when param absent", () => {
		expect(parsePage(null, 5)).toBe(1);
	});

	it("parses valid integer", () => {
		expect(parsePage("3", 5)).toBe(3);
	});

	it("clamps below 1 to 1", () => {
		expect(parsePage("0", 5)).toBe(1);
		expect(parsePage("-5", 5)).toBe(1);
	});

	it("clamps above totalPages to totalPages", () => {
		expect(parsePage("99", 5)).toBe(5);
	});

	it("clamps to 1 when totalPages is 0", () => {
		expect(parsePage("1", 0)).toBe(1);
	});

	it("ignores non-numeric input", () => {
		expect(parsePage("abc", 5)).toBe(1);
	});
});

describe("calcOffset", () => {
	it("page 1 → offset 0", () => {
		expect(calcOffset(1)).toBe(0);
	});

	it("page 2 → offset 25", () => {
		expect(calcOffset(2)).toBe(25);
	});

	it("page 3 → offset 50", () => {
		expect(calcOffset(3)).toBe(50);
	});
});

describe("calcTotalPages", () => {
	it("0 events → 1 page", () => {
		expect(calcTotalPages(0)).toBe(1);
	});

	it("25 events → 1 page", () => {
		expect(calcTotalPages(25)).toBe(1);
	});

	it("26 events → 2 pages", () => {
		expect(calcTotalPages(26)).toBe(2);
	});

	it("50 events → 2 pages", () => {
		expect(calcTotalPages(50)).toBe(2);
	});

	it("51 events → 3 pages", () => {
		expect(calcTotalPages(51)).toBe(3);
	});
});
