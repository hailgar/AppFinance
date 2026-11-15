import { ApiError } from "./api";
export type Command = {
  key: string;
  path: string;
  method: "POST";
  body: string;
};
export interface Vault {
  get(): Promise<Command | null>;
  set(command: Command): Promise<void>;
  clear(): Promise<void>;
}
export type Operation = {
  operation_id: string;
  status: "UNKNOWN" | "APPLIED" | "CONFLICT";
  http_status?: number;
  data?: unknown;
  error?: { code: string; message: string; fields: Record<string, unknown> };
};
type Send = <T>(
  path: string,
  init?: RequestInit,
) => Promise<{ status: number; data: T }>;
export class CommandRunner {
  private busy = false;
  constructor(
    private vault: Vault,
    private request: Send,
  ) {}
  async run(command?: Command): Promise<"APPLIED" | "UNKNOWN" | "CONFLICT"> {
    if (this.busy) throw Error("REQUEST_IN_PROGRESS");
    this.busy = true;
    try {
      let pending = await this.vault.get();
      if (pending && command) throw Error("UNRESOLVED_COMMAND");
      if (pending) {
        try {
          const result = await this.request<Operation>(
            "/operations/" + pending.key,
          );
          if (
            result.data.status === "APPLIED" ||
            result.data.status === "CONFLICT"
          ) {
            await this.vault.clear();
            return result.data.status;
          }
        } catch {
          return "UNKNOWN";
        }
      } else {
        if (!command) return "APPLIED";
        pending = command;
        await this.vault.set(pending); // Never send before durable private storage succeeds.
      }
      try {
        const res = await this.request<unknown>(pending.path, {
          method: pending.method,
          body: pending.body,
          headers: { "Idempotency-Key": pending.key },
        });
        if (res.status === 202) return "UNKNOWN";
        await this.vault.clear();
        return "APPLIED";
      } catch (error) {
        if (error instanceof ApiError && error.status === 409) {
          await this.vault.clear();
          return "CONFLICT";
        }
        if (
          error instanceof ApiError &&
          [400, 404, 422].includes(error.status)
        ) {
          await this.vault.clear();
          throw error;
        }
        return "UNKNOWN"; // Includes timeouts, malformed responses and upstream failures.
      }
    } finally {
      this.busy = false;
    }
  }
}
