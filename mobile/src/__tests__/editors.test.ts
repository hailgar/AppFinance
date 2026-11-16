import { describe, expect, it } from "vitest";
import {
  defaultRevision,
  historyQuery,
  validBudgetDate,
  validHistoryRange,
  validSummaryMonth,
  type BudgetDefault,
} from "../domain";
describe("editor boundaries and query wire format", () => {
  it("uses the exact default's revision rather than the currently effective default", () => {
    const defaults = [
      { effective_from: "2026-11-16", revision: 3 },
      { effective_from: "2026-11-20", revision: 1 },
    ] as BudgetDefault[];
    expect(defaultRevision(defaults, "2026-11-16")).toBe(3);
    expect(defaultRevision(defaults, "2026-11-18")).toBe(0);
  });
  it("restricts default changes to today/future but allows historical daily overrides", () => {
    expect(validBudgetDate("2026-11-15", "DEFAULT", "2026-11-16")).toBe(false);
    expect(validBudgetDate("2026-11-15", "OVERRIDE", "2026-11-16")).toBe(true);
    expect(validBudgetDate("2027-11-17", "DEFAULT", "2026-11-16")).toBe(true);
    expect(validBudgetDate("2027-11-18", "OVERRIDE", "2026-11-16")).toBe(false);
    expect(validBudgetDate("2026-02-30", "OVERRIDE", "2026-11-16")).toBe(false);
  });
  it("preserves type/category filters and opaque cursor while encoding query parameters", () => {
    const path = historyQuery(
      {
        from: "2026-11-01",
        to: "2026-11-16",
        type: "EXPENSE",
        category_code: "EXP_FOOD",
      },
      "a+b/=",
    );
    const query = new URLSearchParams(path.split("?")[1]);
    expect(Object.fromEntries(query)).toEqual({
      from: "2026-11-01",
      to: "2026-11-16",
      limit: "20",
      type: "EXPENSE",
      category_code: "EXP_FOOD",
      cursor: "a+b/=",
    });
    expect(
      historyQuery({ from: "2026-11-01", to: "2026-11-16" }),
    ).not.toContain("type=");
  });
  it("rejects future/reversed/oversized ranges and out-of-window monthly summaries", () => {
    expect(validHistoryRange("2026-11-01", "2026-11-16", "2026-11-16")).toBe(
      true,
    );
    expect(validHistoryRange("2026-11-16", "2026-11-17", "2026-11-16")).toBe(
      false,
    );
    expect(validHistoryRange("2026-11-16", "2026-11-15", "2026-11-16")).toBe(
      false,
    );
    expect(validHistoryRange("2025-11-15", "2026-11-16", "2026-11-16")).toBe(
      false,
    );
    expect(validSummaryMonth("2025-11", "2026-11-16")).toBe(true);
    expect(validSummaryMonth("2025-10", "2026-11-16")).toBe(false);
    expect(validSummaryMonth("2026-12", "2026-11-16")).toBe(false);
  });
});
