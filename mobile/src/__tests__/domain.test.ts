import { describe, expect, it } from "vitest";
import {
  parseAmount,
  businessDate,
  budgetState,
  validTransactionDate,
} from "../domain";
describe("integer rupiah", () => {
  it("separates presentation and payload", () => {
    expect(parseAmount("25.000")).toBe(25000);
    expect(parseAmount("25000")).toBe(25000);
    expect(parseAmount("999.999.999.999")).toBe(999999999999);
  });
  it.each([
    "1.5",
    "25,000",
    "-1",
    "NaN",
    "true",
    "",
    "01",
    "1e3",
    "1000000000000",
    "Rp25.000",
  ])("rejects invalid input %s", (value) =>
    expect(() => parseAmount(value)).toThrow(),
  );
  it("permits zero only for budgets", () => {
    expect(() => parseAmount("0")).toThrow();
    expect(parseAmount("0", true)).toBe(0);
  });
});
describe("business date", () => {
  it("uses Jakarta across UTC midnight boundaries", () => {
    expect(businessDate(new Date("2026-11-15T17:00:00Z"))).toBe("2026-11-16");
    expect(businessDate(new Date("2026-11-15T16:59:59Z"))).toBe("2026-11-15");
  });
  it("validates calendar dates, historical limit and future", () => {
    expect(validTransactionDate("2026-02-30", "2026-11-16")).toBe(false);
    expect(validTransactionDate("2026-11-17", "2026-11-16")).toBe(false);
    expect(validTransactionDate("2025-11-15", "2026-11-16")).toBe(true);
    expect(validTransactionDate("2025-11-14", "2026-11-16")).toBe(false);
  });
});
describe("budget semantics", () => {
  it("distinguishes unset, zero, limit and excess", () => {
    expect(budgetState(null, 35000).amount).toBeNull();
    expect(budgetState(0, 0).amount).toBe(0);
    expect(budgetState(0, 1)).toMatchObject({
      over: true,
      progress: null,
      amount: 1,
    });
    expect(budgetState(100000, 35000)).toMatchObject({
      amount: 65000,
      progress: 35,
    });
    expect(budgetState(100000, 120000)).toMatchObject({
      over: true,
      amount: 20000,
      progress: 100,
    });
  });
});
