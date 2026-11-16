import { describe, expect, it } from "vitest";
import { SessionTransitionQueue } from "../services/sessionLifecycle";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("session transitions", () => {
  it("finishes post-auth logout cleanup before a fast same-account sign-in", async () => {
    const queue = new SessionTransitionQueue();
    const oldCleanup = deferred();
    const events: string[] = [];
    let pendingCommand = "old";
    const logout = queue.run(async () => {
      events.push("auth-signed-out");
      await oldCleanup.promise;
      pendingCommand = "";
      events.push("old-vault-cleared");
    });
    await Promise.resolve();
    const login = queue.run(async () => {
      pendingCommand = "new";
      events.push("new-session");
    });
    await Promise.resolve();
    expect(events).toEqual(["auth-signed-out"]);
    oldCleanup.resolve();
    await Promise.all([logout, login]);
    expect(events).toEqual([
      "auth-signed-out",
      "old-vault-cleared",
      "new-session",
    ]);
    expect(pendingCommand).toBe("new");
  });

  it("waits for every queued orphan cleanup before login", async () => {
    const queue = new SessionTransitionQueue();
    const first = deferred(),
      second = deferred();
    const events: string[] = [];
    const clean1 = queue.run(async () => {
      await first.promise;
      events.push("first");
    });
    const clean2 = queue.run(async () => {
      await second.promise;
      events.push("second");
    });
    const login = queue.run(async () => {
      events.push("login");
    });
    second.resolve();
    await Promise.resolve();
    expect(events).toEqual([]);
    first.resolve();
    await Promise.all([clean1, clean2, login]);
    expect(events).toEqual(["first", "second", "login"]);
  });

  it("reports transition errors while allowing a later recovery attempt", async () => {
    const queue = new SessionTransitionQueue();
    const failure = queue.run(async () => {
      throw Error("native cleanup failed");
    });
    const recovery = queue.run(async () => "retried");
    await expect(failure).rejects.toThrow("native cleanup failed");
    await expect(recovery).resolves.toBe("retried");
  });
});
