import { describe, expect, it, vi } from "vitest";
import { createApi, ApiError } from "../services/api";
function response(status: number, data: unknown = {}) {
  return new Response(
    JSON.stringify(status >= 400 ? { error: { code: "DENIED" } } : { data }),
    { status },
  );
}
describe("Firebase token lifecycle", () => {
  it("refreshes once on 401 preserving command headers and body", async () => {
    const token = vi
      .fn()
      .mockResolvedValueOnce("expired")
      .mockResolvedValueOnce("fresh");
    const send = vi
      .fn()
      .mockResolvedValueOnce(response(401))
      .mockResolvedValueOnce(response(201, { id: "saved" }));
    const api = createApi("https://example.test/api/v1", { token }, send);
    await api("/transactions", {
      method: "POST",
      body: '{"amount":1}',
      headers: { "Idempotency-Key": "same-key" },
    });
    expect(token.mock.calls).toEqual([[false], [true]]);
    expect(send.mock.calls[0]?.[1].body).toBe(send.mock.calls[1]?.[1].body);
    expect(send.mock.calls[1]?.[1].headers).toMatchObject({
      "Idempotency-Key": "same-key",
      Authorization: "Bearer fresh",
    });
  });
  it("does not loop when a refreshed token is rejected", async () => {
    const token = vi.fn().mockResolvedValue("bad");
    const send = vi.fn().mockResolvedValue(response(401));
    await expect(
      createApi("https://example.test", { token }, send)("/me"),
    ).rejects.toBeInstanceOf(ApiError);
    expect(send).toHaveBeenCalledTimes(2);
  });
  it("does not refresh or auto-login for 403", async () => {
    const token = vi.fn().mockResolvedValue("valid");
    const send = vi.fn().mockResolvedValue(response(403));
    await expect(
      createApi("https://example.test", { token }, send)("/me"),
    ).rejects.toMatchObject({ status: 403 });
    expect(token).toHaveBeenCalledTimes(1);
  });
});
