import { ApiError, type TokenSource } from "./api";

// Check both sides of an async refresh: a previous account may finish signing out
// while Firebase resolves a token. That token must never serve another session.
export function bindTokenSource(
  expectedUid: string,
  source: TokenSource,
  currentUid: () => string | null,
): TokenSource {
  const check = () => {
    if (currentUid() !== expectedUid)
      throw new ApiError(401, "SESSION_CHANGED");
  };
  return {
    token: async (force = false) => {
      check();
      const token = await source.token(force);
      check();
      return token;
    },
  };
}
