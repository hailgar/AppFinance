export const MAX_AMOUNT = 999_999_999_999;
export function parseAmount(input: string, allowZero = false): number {
  if (!/^(?:0|[1-9]\d*|[1-9]\d{0,2}(?:\.\d{3})+)$/.test(input))
    throw Error("Masukkan rupiah bulat, tanpa desimal.");
  const value = Number(input.replaceAll(".", ""));
  if (
    !Number.isSafeInteger(value) ||
    value > MAX_AMOUNT ||
    value < (allowZero ? 0 : 1)
  )
    throw Error("Nominal di luar batas yang diizinkan.");
  return value;
}
export const rupiah = (amount: number) =>
  "Rp" + new Intl.NumberFormat("id-ID").format(amount);
export function businessDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (key: string) => parts.find((p) => p.type === key)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
export function validCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + "T00:00:00Z");
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}
export function validTransactionDate(
  value: string,
  today = businessDate(),
): boolean {
  if (!validCalendarDate(value)) return false;
  const age =
    (Date.parse(today + "T00:00:00Z") - Date.parse(value + "T00:00:00Z")) /
    86400000;
  return age >= 0 && age <= 366;
}
export function budgetState(budget: number | null, expense: number) {
  if (budget === null)
    return {
      label: "Budget belum diatur",
      amount: null,
      progress: null,
      over: false,
    };
  const remaining = budget - expense;
  return {
    label:
      remaining < 0
        ? "Melebihi budget"
        : remaining === 0
          ? "Budget habis"
          : "Sisa budget hari ini",
    amount: Math.abs(remaining),
    progress:
      budget === 0
        ? null
        : Math.min(100, Math.max(0, (expense / budget) * 100)),
    over: remaining < 0,
  };
}
export type TransactionType = "EXPENSE" | "INCOME";
export type Transaction = {
  id: string;
  type: TransactionType;
  amount: number;
  category_code: string;
  transaction_date: string;
  note: string | null;
  revision: number;
  created_at: string;
  updated_at: string;
};
export type Category = { code: string; label: string; type: TransactionType };
export type Dashboard = {
  date: string;
  timezone: string;
  budget_amount: number | null;
  budget_source: string;
  expense_total: number;
  income_total: number;
  remaining_amount: number | null;
  usage_percent: number | null;
  budget_status: string;
  recent_transactions: Transaction[];
};
export type Page<T> = { items: T[]; next_cursor: string | null };
export type Monthly = {
  month: string;
  income_total: number;
  expense_total: number;
  net_flow: number;
  expenses_by_category: {
    category_code: string;
    category_label: string;
    amount: number;
  }[];
};
