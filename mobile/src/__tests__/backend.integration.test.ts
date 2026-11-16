import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  historyQuery,
  type Dashboard,
  type Monthly,
  type Page,
  type Transaction,
} from "../domain";
import { createApi } from "../services/api";
import { CommandRunner, type Command, type Vault } from "../services/commands";
import { getCategories } from "../services/resources";

// Explicit opt-in: this suite sends writes to a disposable loopback test fixture.
const base = process.env.CATAT_INTEGRATION_BASE_URL;
if (base && !/^http:\/\/127\.0\.0\.1:8765\/api\/v1$/.test(base)) {
  throw Error(
    "Integration tests require the disposable loopback fixture on port 8765.",
  );
}
const date = "2026-11-16"; // Matches the backend fixture's fixed business clock.
const token = async () => "test-owner";
let api: ReturnType<typeof createApi>;
function vault(): Vault {
  let pending: Command | null = null;
  return {
    get: async () => pending,
    set: async (value) => {
      pending = value;
    },
    clear: async () => {
      pending = null;
    },
  };
}
const expense = (amount = 35000) => ({
  id: randomUUID(),
  type: "EXPENSE",
  amount,
  category_code: "EXP_FOOD",
  transaction_date: date,
  note: null,
});

describe.skipIf(!base)("mobile client ↔ FastAPI HTTP contract", () => {
  beforeAll(() => {
    vi.stubGlobal("__DEV__", true);
    api = createApi(base!, { token });
  });
  afterAll(() => vi.unstubAllGlobals());

  it("loads selectable category arrays from the backend collection envelope", async () => {
    const categories = await getCategories(api, "EXPENSE");
    expect(categories.map((c) => c.code)).toContain("EXP_FOOD");
    expect(categories.every((c) => c.type === "EXPENSE")).toBe(true);
    const income = await getCategories(api, "INCOME");
    expect(income.map((c) => c.code)).toContain("INC_SALARY");
    expect(income.every((c) => c.type === "INCOME")).toBe(true);
  });

  it("confirms transaction writes and refetches matching dashboard, history and summary", async () => {
    await api("/budgets/defaults/" + date, {
      method: "PUT",
      headers: { "Idempotency-Key": randomUUID() },
      body: JSON.stringify({ amount: 100000, expected_revision: 0 }),
    });
    const body = expense();
    const key = randomUUID();
    const request = {
      method: "POST",
      headers: { "Idempotency-Key": key },
      body: JSON.stringify(body),
    };
    expect((await api<Transaction>("/transactions", request)).status).toBe(201);
    expect((await api<Transaction>("/transactions", request)).status).toBe(200);
    expect(
      (await api<Dashboard>("/dashboard?date=" + date)).data.remaining_amount,
    ).toBe(65000);
    await api("/transactions", {
      method: "POST",
      headers: { "Idempotency-Key": randomUUID() },
      body: JSON.stringify({
        ...expense(200000),
        type: "INCOME",
        category_code: "INC_SALARY",
      }),
    });
    const dashboard = (await api<Dashboard>("/dashboard?date=" + date)).data;
    expect(dashboard).toMatchObject({
      expense_total: 35000,
      income_total: 200000,
      remaining_amount: 65000,
    });
    const history = (
      await api<Page<Transaction>>(`/transactions?from=${date}&to=${date}`)
    ).data;
    expect(history.items.filter((t) => t.id === body.id)).toHaveLength(1);
    expect(
      (await api<Monthly>("/summary/monthly?month=2026-11")).data,
    ).toMatchObject({
      income_total: 200000,
      expense_total: 35000,
      net_flow: 165000,
      expenses_by_category: [
        {
          category_code: "EXP_FOOD",
          category_label: "Makan & Minum",
          amount: 35000,
        },
      ],
    });
  });

  it("recovers a dropped write response through the real operation receipt without a second POST", async () => {
    let posts = 0;
    const transport: typeof fetch = async (url, init) => {
      const res = await fetch(url, init);
      if (init?.method === "POST") {
        posts++;
        if (res.status === 201)
          throw Error("Simulated response lost after server commit");
      }
      return res;
    };
    const client = createApi(base!, { token }, transport);
    const pending = vault();
    const command: Command = {
      key: randomUUID(),
      path: "/transactions",
      method: "POST",
      body: JSON.stringify(expense(1000)),
    };
    expect(await new CommandRunner(pending, client).run(command)).toBe(
      "UNKNOWN",
    );
    expect(await pending.get()).toEqual(command);
    expect(await new CommandRunner(pending, client).run()).toBe("APPLIED");
    expect(posts).toBe(1);
    expect(await pending.get()).toBeNull();
  });

  it("rejects malformed amounts, invalid tokens and another account", async () => {
    await expect(
      api("/transactions", {
        method: "POST",
        headers: { "Idempotency-Key": randomUUID() },
        body: JSON.stringify({ ...expense(), amount: "35000" }),
      }),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      createApi(base!, { token: async () => "invalid" })("/me"),
    ).rejects.toMatchObject({ status: 401 });
    await expect(
      createApi(base!, { token: async () => "test-other" })("/me"),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("returns a real revision conflict for review without applying stale changes", async () => {
    const original = expense(1500);
    await api("/transactions", {
      method: "POST",
      headers: { "Idempotency-Key": randomUUID() },
      body: JSON.stringify(original),
    });
    await expect(
      api("/transactions/" + original.id, {
        method: "PATCH",
        headers: { "Idempotency-Key": randomUUID() },
        body: JSON.stringify({ amount: 2000, expected_revision: 0 }),
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      (await api<Transaction>("/transactions/" + original.id)).data.amount,
    ).toBe(1500);
  });
  it("uses PUT/DELETE safely for overrides and reuses the tombstone revision", async () => {
    const pending = vault();
    const run = new CommandRunner(pending, api);
    const target = "/budgets/daily/2026-11-17";
    const put: Command = {
      key: randomUUID(),
      path: target,
      method: "PUT",
      body: JSON.stringify({ amount: 0, expected_revision: 0 }),
    };
    expect(await run.run(put)).toBe("APPLIED");
    let effective = (
      await api<{
        amount: number;
        override_revision: number;
        override_active: boolean;
      }>("/budgets/effective?date=2026-11-17")
    ).data;
    expect(effective).toMatchObject({
      amount: 0,
      override_revision: 1,
      override_active: true,
    });
    expect(
      await run.run({
        key: randomUUID(),
        path: target + "?expected_revision=1",
        method: "DELETE",
      }),
    ).toBe("APPLIED");
    effective = (
      await api<typeof effective>("/budgets/effective?date=2026-11-17")
    ).data;
    expect(effective).toMatchObject({
      amount: 100000,
      override_revision: 2,
      override_active: false,
    });
    expect(
      await run.run({
        key: randomUUID(),
        path: target,
        method: "PUT",
        body: JSON.stringify({
          amount: 50000,
          expected_revision: effective.override_revision,
        }),
      }),
    ).toBe("APPLIED");
    expect(
      (await api<typeof effective>("/budgets/effective?date=2026-11-17")).data,
    ).toMatchObject({ amount: 50000, override_revision: 3 });
  });

  it("edits date and type, filters history, and tombstones the transaction through the mobile command runner", async () => {
    const original = expense(2500),
      pending = vault();
    const runner = new CommandRunner(pending, api);
    expect(
      await runner.run({
        key: randomUUID(),
        path: "/transactions",
        method: "POST",
        body: JSON.stringify(original),
      }),
    ).toBe("APPLIED");
    expect(
      await runner.run({
        key: randomUUID(),
        path: "/transactions/" + original.id,
        method: "PATCH",
        body: JSON.stringify({
          transaction_date: "2026-11-15",
          type: "INCOME",
          category_code: "INC_BONUS",
          expected_revision: 1,
        }),
      }),
    ).toBe("APPLIED");
    const after = (await api<Transaction>("/transactions/" + original.id)).data;
    expect(after).toMatchObject({
      transaction_date: "2026-11-15",
      type: "INCOME",
      amount: 2500,
      revision: 2,
    });
    const filtered = (
      await api<Page<Transaction>>(
        historyQuery({
          from: "2026-11-15",
          to: "2026-11-15",
          type: "INCOME",
          category_code: "INC_BONUS",
        }),
      )
    ).data;
    expect(filtered.items.some((x) => x.id === original.id)).toBe(true);
    const oldDay = (await api<Dashboard>("/dashboard?date=" + date)).data;
    expect(oldDay.recent_transactions.some((x) => x.id === original.id)).toBe(
      false,
    );
    expect(
      await runner.run({
        key: randomUUID(),
        path: "/transactions/" + original.id + "?expected_revision=2",
        method: "DELETE",
      }),
    ).toBe("APPLIED");
    await expect(api("/transactions/" + original.id)).rejects.toMatchObject({
      status: 404,
    });
    expect(
      (await api<Dashboard>("/dashboard?date=2026-11-15")).data.income_total,
    ).toBe(0);
  });
});
