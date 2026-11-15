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

it("aborts a response body that never completes even after headers arrived", async () => {
  vi.useFakeTimers();
  try {
    const send: typeof fetch = async (_url, init) =>
      new Response(
        new ReadableStream({
          start(controller) {
            init?.signal?.addEventListener("abort", () =>
              controller.error(
                new DOMException("Body timed out", "AbortError"),
              ),
            );
          },
        }),
        { status: 200 },
      );
    const promise = createApi(
      "https://example.test/api/v1",
      { token: async () => "valid" },
      send,
    )("/dashboard");
    const assertion = expect(promise).rejects.toMatchObject({
      name: "AbortError",
    });
    await vi.advanceTimersByTimeAsync(15000);
    await assertion;
  } finally {
    vi.useRealTimers();
  }
});

it("times out a stalled Firebase token refresh and never sends after it eventually resolves", async () => {
  vi.useFakeTimers();
  try {
    let finishToken!: (value: string) => void;
    const token = new Promise<string>((resolve) => {
      finishToken = resolve;
    });
    const transport = vi.fn().mockResolvedValue(response(201));
    const request = createApi(
      "https://example.test/api/v1",
      { token: () => token },
      transport,
    )("/transactions", { method: "POST", body: '{"amount":35000}' });
    const assertion = expect(request).rejects.toMatchObject({
      name: "AbortError",
    });
    await vi.advanceTimersByTimeAsync(15000);
    await assertion;
    expect(transport).not.toHaveBeenCalled();
    finishToken("eventually-refreshed");
    await vi.runAllTimersAsync();
    expect(transport).not.toHaveBeenCalled();
  } finally {
    vi.useRealTimers();
  }
});
