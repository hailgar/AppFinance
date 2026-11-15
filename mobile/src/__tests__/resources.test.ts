import { expect, it, vi } from "vitest";
import { createApi } from "../services/api";
import { getCategories } from "../services/resources";

it("unwraps FastAPI category pages into the array used by the transaction form", async () => {
  const items = [{ code: "EXP_FOOD", label: "Makan & Minum", type: "EXPENSE" }];
  const transport = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        data: { items, next_cursor: null },
        request_id: "category-regression",
      }),
    ),
  );
  const api = createApi(
    "https://example.test/api/v1",
    { token: async () => "test" },
    transport,
  );
  const result = await getCategories(api, "EXPENSE");
  expect(result.map((c) => c.code)).toEqual(["EXP_FOOD"]);
  expect(transport.mock.calls[0]?.[0]).toBe(
    "https://example.test/api/v1/categories?type=EXPENSE",
  );
});
