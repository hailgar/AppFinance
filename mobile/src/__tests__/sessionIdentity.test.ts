import { expect, it, vi } from "vitest";
import { bindTokenSource } from "../services/sessionIdentity";
import { validApiBase } from "../services/config";

it("never retrieves a token for a different or signed-out account", async () => {
  const source = { token: vi.fn(async () => "token") };
  await expect(
    bindTokenSource("owner", source, () => "other").token(),
  ).rejects.toMatchObject({ status: 401 });
  await expect(
    bindTokenSource("owner", source, () => null).token(),
  ).rejects.toMatchObject({ status: 401 });
  expect(source.token).not.toHaveBeenCalled();
});

it("rejects a token when account identity changes while a refresh is pending", async () => {
  let uid = "owner";
  const token = bindTokenSource(
    "owner",
    {
      token: async () => {
        uid = "other";
        return "other-token";
      },
    },
    () => uid,
  );
  await expect(token.token(true)).rejects.toMatchObject({
    code: "SESSION_CHANGED",
  });
});

it("accepts only the expected versioned API base without credentials or query", () => {
  expect(validApiBase("https://api.example/api/v1", false)).toBe(true);
  expect(validApiBase("http://192.168.1.2:8000/api/v1/", true)).toBe(true);
  for (const url of [
    "",
    "broken",
    "http://api.example/api/v1",
    "https://api.example",
    "https://api.example/api/v1?token=x",
    "https://user:pass@api.example/api/v1",
  ]) {
    expect(validApiBase(url, false)).toBe(false);
  }
});
