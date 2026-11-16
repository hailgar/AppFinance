import { businessDate } from "../../src/domain";
const today = businessDate(),
  previousDay = new Date(Date.parse(today + "T12:00:00+07:00") - 86400000)
    .toISOString()
    .slice(0, 10),
  stamp = today + "T05:00:00Z";
export const categories = [
  ["EXP_FOOD", "Makan & Minum", "EXPENSE"],
  ["EXP_TRANSPORT", "Transportasi", "EXPENSE"],
  ["EXP_SHOPPING", "Belanja", "EXPENSE"],
  ["EXP_BILLS", "Tagihan", "EXPENSE"],
  ["EXP_ENTERTAINMENT", "Hiburan", "EXPENSE"],
  ["EXP_OTHER", "Lainnya", "EXPENSE"],
  ["INC_SALARY", "Gaji", "INCOME"],
  ["INC_BONUS", "Bonus", "INCOME"],
  ["INC_OTHER", "Lainnya", "INCOME"],
].map(([code, label, type]) => ({ code, label, type }));
const seed = () => [
  {
    id: "example-food",
    type: "EXPENSE",
    amount: 35000,
    category_code: "EXP_FOOD",
    transaction_date: today,
    note: "Makan siang",
    revision: 1,
    created_at: stamp,
    updated_at: stamp,
  },
  {
    id: "example-income",
    type: "INCOME",
    amount: 200000,
    category_code: "INC_OTHER",
    transaction_date: today,
    note: "Pemasukan contoh",
    revision: 1,
    created_at: stamp,
    updated_at: stamp,
  },
  {
    id: "example-transport",
    type: "EXPENSE",
    amount: 65000,
    category_code: "EXP_TRANSPORT",
    transaction_date: previousDay,
    note: "Transportasi kemarin",
    revision: 1,
    created_at: stamp,
    updated_at: stamp,
  },
];
let transactions = seed(),
  defaultBudget = 100000;
const overrides = new Map();
export function resetExamples() {
  transactions = seed();
  defaultBudget = 100000;
  overrides.clear();
}
const sum = (items, type) =>
  items
    .filter((item) => item.type === type)
    .reduce((total, item) => total + item.amount, 0);
export async function previewApi(path, init = {}) {
  const url = new URL(path, "https://preview.invalid"),
    route = url.pathname;
  let data;
  if (init.method && init.method !== "GET") {
    const body = init.body ? JSON.parse(init.body) : {};
    if (route === "/transactions" && init.method === "POST") {
      data = { ...body, revision: 1, created_at: stamp, updated_at: stamp };
      transactions.unshift(data);
    } else if (route.startsWith("/transactions/")) {
      const id = decodeURIComponent(route.split("/").at(-1)),
        item = transactions.find((item) => item.id === id);
      if (!item) throw Error("Contoh transaksi tidak tersedia.");
      if (init.method === "DELETE") {
        transactions = transactions.filter((item) => item.id !== id);
        data = { deleted: true };
      } else {
        Object.assign(item, body, {
          revision: item.revision + 1,
          updated_at: stamp,
        });
        data = item;
      }
    } else if (route.startsWith("/budgets/daily/")) {
      const date = route.split("/").at(-1);
      if (init.method === "DELETE") overrides.delete(date);
      else overrides.set(date, body.amount);
      data = { amount: body.amount ?? null, revision: 2 };
    } else if (route.startsWith("/budgets/defaults/")) {
      defaultBudget = body.amount;
      data = { amount: body.amount, revision: 2 };
    } else throw Error("Aksi ini tidak tersedia pada pratinjau UI.");
  } else if (route === "/categories")
    data = {
      items: categories.filter(
        (item) =>
          !url.searchParams.get("type") ||
          item.type === url.searchParams.get("type"),
      ),
      next_cursor: null,
    };
  else if (route === "/dashboard") {
    const date = url.searchParams.get("date") || today,
      items = transactions.filter((item) => item.transaction_date === date),
      budget = overrides.get(date) ?? defaultBudget,
      expense = sum(items, "EXPENSE");
    data = {
      date,
      timezone: "Asia/Jakarta",
      budget_amount: budget,
      budget_source: "DEFAULT",
      expense_total: expense,
      income_total: sum(items, "INCOME"),
      remaining_amount: budget - expense,
      usage_percent: (expense / budget) * 100,
      budget_status: "WITHIN_BUDGET",
      recent_transactions: items,
    };
  } else if (route === "/transactions")
    data = {
      items: transactions.filter(
        (item) =>
          (!url.searchParams.get("from") ||
            item.transaction_date >= url.searchParams.get("from")) &&
          (!url.searchParams.get("to") ||
            item.transaction_date <= url.searchParams.get("to")) &&
          (!url.searchParams.get("type") ||
            item.type === url.searchParams.get("type")) &&
          (!url.searchParams.get("category_code") ||
            item.category_code === url.searchParams.get("category_code")),
      ),
      next_cursor: null,
    };
  else if (route.startsWith("/transactions/")) {
    data = transactions.find(
      (item) => item.id === decodeURIComponent(route.split("/").at(-1)),
    );
    if (!data) throw Error("Contoh transaksi tidak tersedia.");
  } else if (route === "/summary/monthly") {
    const items = transactions.filter((item) =>
      item.transaction_date.startsWith(
        url.searchParams.get("month") || today.slice(0, 7),
      ),
    );
    data = {
      month: url.searchParams.get("month"),
      income_total: sum(items, "INCOME"),
      expense_total: sum(items, "EXPENSE"),
      net_flow: sum(items, "INCOME") - sum(items, "EXPENSE"),
      expenses_by_category: categories
        .filter((category) => category.type === "EXPENSE")
        .map((category) => ({
          category_code: category.code,
          category_label: category.label,
          amount: items
            .filter((item) => item.category_code === category.code)
            .reduce((total, item) => total + item.amount, 0),
        }))
        .filter((item) => item.amount > 0),
    };
  } else if (route === "/budgets/effective") {
    const date = url.searchParams.get("date");
    data = {
      amount: overrides.get(date) ?? defaultBudget,
      source: overrides.has(date) ? "OVERRIDE" : "DEFAULT",
      effective_from: today.slice(0, 7) + "-01",
      override_active: overrides.has(date),
      override_revision: overrides.has(date) ? 1 : 0,
    };
  } else if (route === "/budgets/defaults")
    data = {
      items: [
        {
          effective_from: today.slice(0, 7) + "-01",
          amount: defaultBudget,
          revision: 1,
          created_at: stamp,
          updated_at: stamp,
        },
      ],
      next_cursor: null,
    };
  else if (route === "/storage/status")
    data = {
      status: "OK",
      source_rows_processed: 4,
      projected_rows_processed: 4,
    };
  else throw Error("Layar contoh ini belum menyediakan data tersebut.");
  return {
    status: 200,
    data: structuredClone(data),
    request_id: "ui-preview-only",
  };
}
