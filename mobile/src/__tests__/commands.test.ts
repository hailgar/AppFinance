import { describe, expect, it, vi } from "vitest";
import { CommandRunner, type Command, type Vault } from "../services/commands";
import { ApiError } from "../services/api";
const command: Command = {
  key: "operation-1",
  path: "/transactions",
  method: "POST",
  body: '{"id":"same-id","amount":25000}',
};
function memory() {
  let value: Command | null = null;
  return {
    get: async () => value,
    set: async (c: Command) => {
      value = c;
    },
    clear: async () => {
      value = null;
    },
  } satisfies Vault;
}
function response(status: number, data: unknown = {}) {
  return { status, data };
}
describe("uncertain financial writes", () => {
  it("keeps the identical key and body after UNKNOWN and restart", async () => {
    const vault = memory();
    const send = vi
      .fn()
      .mockResolvedValueOnce(response(202, { status: "UNKNOWN" }))
      .mockResolvedValueOnce(response(202, { status: "UNKNOWN" }))
      .mockResolvedValueOnce(response(201));
    const first = new CommandRunner(vault, send);
    expect(await first.run(command)).toBe("UNKNOWN");
    expect(await vault.get()).toEqual(command);
    const restarted = new CommandRunner(vault, send);
    expect(await restarted.run()).toBe("APPLIED");
    expect(send.mock.calls[0]?.[1]).toEqual(send.mock.calls[2]?.[1]);
    expect(await vault.get()).toBeNull();
  });
  it("checks receipt without re-posting after timeout", async () => {
    const vault = memory();
    const send = vi
      .fn()
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce(response(200, { status: "APPLIED" }));
    expect(await new CommandRunner(vault, send).run(command)).toBe("UNKNOWN");
    expect(await new CommandRunner(vault, send).run()).toBe("APPLIED");
    expect(send).toHaveBeenCalledTimes(2);
  });
  it("blocks replacement commands until reconciliation", async () => {
    const vault = memory();
    await vault.set(command);
    const send = vi.fn();
    await expect(
      new CommandRunner(vault, send).run({ ...command, key: "new-key" }),
    ).rejects.toThrow("UNRESOLVED_COMMAND");
    expect(send).not.toHaveBeenCalled();
  });
  it("returns conflicts for review instead of automatic resubmit", async () => {
    const vault = memory();
    const send = vi
      .fn()
      .mockRejectedValue(new ApiError(409, "REVISION_CONFLICT"));
    expect(await new CommandRunner(vault, send).run(command)).toBe("CONFLICT");
    expect(send).toHaveBeenCalledTimes(1);
    expect(await vault.get()).toBeNull();
  });
  it("never sends if secure storage fails", async () => {
    const vault = memory();
    vault.set = async () => {
      throw Error("disk");
    };
    const send = vi.fn();
    await expect(new CommandRunner(vault, send).run(command)).rejects.toThrow(
      "disk",
    );
    expect(send).not.toHaveBeenCalled();
  });
  it("retains UNKNOWN when operation lookup is unavailable", async () => {
    const vault = memory();
    await vault.set(command);
    const send = vi.fn().mockRejectedValue(new Error("offline"));
    expect(await new CommandRunner(vault, send).run()).toBe("UNKNOWN");
    expect(send).toHaveBeenCalledTimes(1);
    expect(await vault.get()).toEqual(command);
  });
  it("allows validation correction after a definitive rejection", async () => {
    const vault = memory();
    const send = vi
      .fn()
      .mockRejectedValue(new ApiError(422, "VALIDATION_ERROR"));
    await expect(
      new CommandRunner(vault, send).run(command),
    ).rejects.toBeInstanceOf(ApiError);
    expect(await vault.get()).toBeNull();
  });
});
