export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}
export interface TokenSource {
  token(forceRefresh?: boolean): Promise<string>;
}
export function createApi(
  base: string,
  auth: TokenSource,
  transport: typeof fetch = fetch,
) {
  const root = base.replace(/\/$/, "");
  if (!/^https:\/\//.test(root) && !(__DEV__ && /^http:\/\//.test(root)))
    throw Error("Gunakan URL HTTPS untuk backend.");
  return async function request<T>(
    path: string,
    init: RequestInit = {},
  ): Promise<{ status: number; data: T }> {
    const send = async (force: boolean) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      try {
        return await transport(root + path, {
          ...init,
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
            ...init.headers,
            Authorization: `Bearer ${await auth.token(force)}`,
          },
        });
      } finally {
        clearTimeout(timeout);
      }
    };
    let res = await send(false);
    if (res.status === 401) res = await send(true); // One SDK refresh only; same command body/key.
    const body = await res.json().catch(() => null);
    if (!res.ok)
      throw new ApiError(res.status, body?.error?.code || "REQUEST_FAILED");
    if (!body || !("data" in body)) throw new ApiError(502, "INVALID_RESPONSE");
    return { status: res.status, data: body.data as T };
  };
}
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401)
      return "Sesi perlu diperbarui. Keluar lalu masuk kembali.";
    if (error.status === 403)
      return "Akun ini belum diizinkan mengakses aplikasi.";
    if (error.status === 409)
      return "Data berubah. Muat ulang dan tinjau sebelum mencoba lagi.";
    if (error.status === 422) return "Periksa kembali data yang diisi.";
  }
  return "Belum bisa terhubung. Coba lagi.";
}
