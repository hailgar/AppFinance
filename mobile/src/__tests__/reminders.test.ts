import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../services/api";
import {
  ReminderController,
  defaultPreferences,
  type Permission,
  type Preferences,
  type ReminderDevice,
  type ReminderRequest,
  type ReminderStore,
  type SavedReminders,
  type Scheduled,
} from "../reminders/controller";

function fixture() {
  let saved: SavedReminders | null = null;
  let schedules: Scheduled[] = [];
  let permission: Permission = {
    granted: true,
    status: "granted",
    canAskAgain: false,
  };
  let zone = "Asia/Jakarta";
  let ids = 0;
  let operations = 0;
  let server = defaultPreferences();
  let writeMode: "normal" | "unknown" | "lost-response" | "conflict" = "normal";
  const receipts = new Map<string, { status: string; data?: Preferences }>();
  const store = {
    get: vi.fn(async () => (saved ? structuredClone(saved) : null)),
    set: vi.fn(async (value: SavedReminders) => {
      saved = structuredClone(value);
    }),
    clear: vi.fn(async () => {
      saved = null;
    }),
  } satisfies ReminderStore;
  const device = {
    prepare: vi.fn(async () => undefined),
    permission: vi.fn(async () => ({ ...permission })),
    requestPermission: vi.fn(async () => ({ ...permission })),
    scheduled: vi.fn(async () => structuredClone(schedules)),
    schedule: vi.fn(async (uid, kind, time, zone) => {
      const id = "native-" + ++ids;
      schedules.push({ id, uid, kind, time, zone });
      return id;
    }),
    cancel: vi.fn(async (id) => {
      schedules = schedules.filter((s) => s.id !== id);
    }),
    test: vi.fn(async (uid) => {
      schedules.push({
        id: "test-" + ++ids,
        uid,
        kind: "test",
        time: null,
        zone,
      });
    }),
  } satisfies ReminderDevice;
  const send = vi.fn(
    async (
      path: string,
      init?: RequestInit,
    ): Promise<{ status: number; data: unknown }> => {
      if (path.startsWith("/operations/")) {
        const key = path.slice("/operations/".length);
        const receipt = receipts.get(key);
        return {
          status: receipt ? 200 : 202,
          data: receipt || { status: "UNKNOWN" },
        };
      }
      if (path !== "/preferences") throw Error("Unexpected endpoint");
      if (!init?.method) return { status: 200, data: structuredClone(server) };
      if (init.method !== "PUT") throw Error("Unexpected mutation");
      const key = (init.headers as Record<string, string>)["Idempotency-Key"]!;
      const command = JSON.parse(init.body as string);
      if (writeMode === "unknown") {
        writeMode = "normal";
        return { status: 202, data: { status: "UNKNOWN" } };
      }
      if (writeMode === "conflict") {
        writeMode = "normal";
        server = { ...server, revision: server.revision + 1 };
        throw new ApiError(409, "REVISION_CONFLICT");
      }
      if (command.expected_revision !== server.revision)
        throw new ApiError(409, "REVISION_CONFLICT");
      server = {
        budget_reminder: command.budget_reminder,
        record_reminder: command.record_reminder,
        revision: server.revision + 1,
      };
      receipts.set(key, { status: "APPLIED", data: structuredClone(server) });
      if (writeMode === "lost-response") {
        writeMode = "normal";
        throw Error("Response lost after server committed");
      }
      return { status: 200, data: structuredClone(server) };
    },
  );
  const create = () =>
    new ReminderController(
      "owner",
      store,
      device,
      send as ReminderRequest,
      () => "00000000-0000-4000-8000-" + String(++operations).padStart(12, "0"),
      () => zone,
    );
  return {
    store,
    device,
    send,
    create,
    schedules: () => schedules,
    saved: () => saved,
    setSchedules: (value: Scheduled[]) => {
      schedules = value;
    },
    setPermission: (value: Permission) => {
      permission = value;
    },
    setZone: (value: string) => {
      zone = value;
    },
    setServer: (value: Preferences) => {
      server = structuredClone(value);
    },
    server: () => server,
    setWriteMode: (value: typeof writeMode) => {
      writeMode = value;
    },
  };
}
const puts = (f: ReturnType<typeof fixture>) =>
  f.send.mock.calls.filter(([, init]) => init?.method === "PUT");

describe("local daily reminder lifecycle", () => {
  it("starts disabled and does not request notification permission implicitly", async () => {
    const f = fixture();
    f.setPermission({
      granted: false,
      status: "undetermined",
      canAskAgain: true,
    });
    const controller = f.create();
    await controller.start(false);
    expect(controller.snapshot().preferences).toEqual(defaultPreferences());
    expect(f.device.requestPermission).not.toHaveBeenCalled();
    expect(f.device.schedule).not.toHaveBeenCalled();
    expect(f.send).not.toHaveBeenCalled();
  });

  it("requests permission only on a direct first enable, and never loops after denial", async () => {
    const f = fixture();
    f.setPermission({
      granted: false,
      status: "undetermined",
      canAskAgain: true,
    });
    f.device.requestPermission.mockImplementation(async () => {
      const denied = { granted: false, status: "denied", canAskAgain: false };
      f.setPermission(denied);
      return denied;
    });
    const controller = f.create();
    await controller.start(false);
    await controller.update("budget_reminder", true, "08:00", false);
    await controller.refresh(false);
    await controller.update("record_reminder", true, "20:00", false);
    expect(f.device.requestPermission).toHaveBeenCalledTimes(1);
    expect(f.device.schedule).not.toHaveBeenCalled();
    expect(controller.snapshot().active).toEqual({
      budget_reminder: false,
      record_reminder: false,
    });
    expect(controller.snapshot().dirty).toBe(true);
  });

  it("deduplicates real schedules, replaces changed time, and disables only active daily reminders", async () => {
    const f = fixture(),
      controller = f.create();
    await controller.start(false);
    await controller.update("budget_reminder", true, "08:00", false);
    const first = f.schedules()[0]!;
    f.setSchedules([first, { ...first, id: "duplicate" }]);
    await controller.refresh(false);
    await controller.refresh(false);
    expect(f.schedules()).toHaveLength(1);
    expect(f.device.schedule).toHaveBeenCalledTimes(1);
    expect(controller.snapshot().active.budget_reminder).toBe(true);
    await controller.update("budget_reminder", true, "09:30", false);
    expect(f.schedules().map((s) => s.time)).toEqual(["09:30"]);
    expect(f.device.cancel).toHaveBeenCalledWith(first.id);
    await controller.update("budget_reminder", false, "09:30", false);
    expect(f.schedules()).toEqual([]);
    expect(controller.snapshot().active.budget_reminder).toBe(false);
  });

  it("reconciles timezone changes, OS schedule loss and permission revocation from actual device state", async () => {
    const f = fixture(),
      controller = f.create();
    await controller.start(false);
    await controller.update("record_reminder", true, "20:00", false);
    f.setZone("Asia/Tokyo");
    await controller.refresh(false);
    expect(f.schedules()).toMatchObject([
      { zone: "Asia/Tokyo", time: "20:00" },
    ]);
    f.setSchedules([]); // e.g. system removed a pending alarm; do not trust stored IDs.
    await controller.refresh(false);
    expect(f.schedules()).toHaveLength(1);
    f.setPermission({ granted: false, status: "denied", canAskAgain: false });
    await controller.refresh(false);
    expect(f.schedules()).toHaveLength(0);
    expect(controller.snapshot().active.record_reminder).toBe(false);
    expect(f.device.requestPermission).not.toHaveBeenCalled();
  });

  it("does not claim a schedule is active when the device fails to retain it", async () => {
    const f = fixture();
    f.device.schedule.mockImplementation(async () => "not-retained");
    const controller = f.create();
    await controller.start(false);
    await controller.update("budget_reminder", true, "08:00", false);
    expect(controller.snapshot().active.budget_reminder).toBe(false);
    expect(controller.snapshot().ids).toEqual({});
  });

  it("removes tagged stale-account daily schedules while preserving current test notifications", async () => {
    const f = fixture();
    f.setSchedules([
      {
        id: "old-account",
        uid: "other",
        kind: "budget_reminder",
        time: "08:00",
        zone: "Asia/Jakarta",
      },
      {
        id: "current-test",
        uid: "owner",
        kind: "test",
        time: null,
        zone: "Asia/Jakarta",
      },
    ]);
    await f.create().start(false);
    expect(f.schedules().map((s) => s.id)).toEqual(["current-test"]);
  });

  it("replays StrictMode-style stop(false) then start without deleting local choices", async () => {
    const f = fixture(),
      controller = f.create();
    await controller.start(false);
    await controller.update("record_reminder", true, "20:00", false);
    const cleanup = controller.stop(false);
    const restart = controller.start(false);
    await Promise.all([cleanup, restart]);
    expect(f.store.clear).not.toHaveBeenCalled();
    expect(f.schedules()).toHaveLength(1);
    expect(controller.snapshot().active.record_reminder).toBe(true);
  });

  it("cancels all account schedules on logout and can restore after native sign-out failure", async () => {
    const f = fixture(),
      controller = f.create();
    await controller.start(false);
    await controller.update("budget_reminder", true, "08:00", false);
    await controller.test();
    await controller.stop();
    expect(f.schedules()).toEqual([]);
    expect(f.saved()).toBeNull();
    await expect(controller.refresh(false)).rejects.toThrow(
      "Sesi pengingat sudah ditutup",
    );
    await controller.resume(false);
    expect(f.saved()?.preferences.budget_reminder.enabled).toBe(true);
    expect(f.schedules()).toHaveLength(1);
  });

  it("retains private preferences during sign-out preparation and clears them only after success", async () => {
    const f = fixture(),
      controller = f.create();
    await controller.start(false);
    await controller.update("budget_reminder", true, "08:00", false);
    await controller.stop(false);
    expect(f.schedules()).toEqual([]);
    expect(f.saved()?.preferences.budget_reminder.enabled).toBe(true);
    expect(f.store.clear).not.toHaveBeenCalled();
    await controller.stop(true);
    expect(f.saved()).toBeNull();
    expect(f.store.clear).toHaveBeenCalledTimes(1);
  });

  it("waits for an in-flight scheduler then removes its newly-created notification during logout", async () => {
    const f = fixture(),
      controller = f.create();
    await controller.start(false);
    const normalSchedule = f.device.schedule.getMockImplementation()!;
    let release: (() => void) | undefined;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    let entered: (() => void) | undefined;
    const reached = new Promise<void>((resolve) => {
      entered = resolve;
    });
    f.device.schedule.mockImplementation(async (...args) => {
      entered!();
      await blocked;
      return normalSchedule(...args);
    });
    const update = controller.update("budget_reminder", true, "08:00", false);
    await reached;
    const logout = controller.stop();
    release!();
    await Promise.all([update, logout]);
    expect(f.schedules()).toEqual([]);
    expect(f.saved()).toBeNull();
  });
});

describe("reminder preference backup", () => {
  it("keeps offline changes on restart and backs them up only after reconnection", async () => {
    const f = fixture();
    await f.create().start(false);
    const controller = f.create();
    await controller.start(false);
    await controller.update("budget_reminder", true, "07:15", false);
    expect(f.send).not.toHaveBeenCalled();
    const restarted = f.create();
    await restarted.start(false);
    expect(restarted.snapshot().preferences.budget_reminder.time).toBe("07:15");
    expect(restarted.snapshot().dirty).toBe(true);
    await restarted.refresh(true);
    expect(puts(f)).toHaveLength(1);
    expect(restarted.snapshot()).toMatchObject({
      dirty: false,
      pending: null,
      serverChecked: true,
    });
    expect(f.server().budget_reminder.time).toBe("07:15");
  });

  it("retries an UNKNOWN write after restart with identical operation key and body", async () => {
    const f = fixture(),
      controller = f.create();
    await controller.start(true);
    f.setWriteMode("unknown");
    await controller.update("record_reminder", true, "19:45", true);
    const pending = structuredClone(controller.snapshot().pending);
    expect(pending).not.toBeNull();
    await expect(
      controller.update("record_reminder", false, "19:45", true),
    ).rejects.toThrow("Periksa pencadangan sebelumnya");
    const restarted = f.create();
    await restarted.start(true);
    const writes = puts(f);
    expect(writes).toHaveLength(2);
    expect(writes[0]?.[1]).toEqual(writes[1]?.[1]);
    expect(restarted.snapshot().pending).toBeNull();
    expect(restarted.snapshot().preferences.revision).toBe(1);
  });

  it("uses an APPLIED receipt for a lost response without sending PUT twice", async () => {
    const f = fixture(),
      controller = f.create();
    await controller.start(true);
    f.setWriteMode("lost-response");
    await controller.update("budget_reminder", true, "07:00", true);
    expect(controller.snapshot().pending).not.toBeNull();
    const restarted = f.create();
    await restarted.start(true);
    expect(puts(f)).toHaveLength(1);
    expect(restarted.snapshot().pending).toBeNull();
    expect(restarted.snapshot().preferences).toEqual(f.server());
  });

  it("keeps pending backup on failed operation lookup and never sends an unverified replacement", async () => {
    const f = fixture(),
      controller = f.create();
    await controller.start(true);
    f.setWriteMode("unknown");
    await controller.update("record_reminder", true, "19:00", true);
    const original = f.send.getMockImplementation()!;
    f.send.mockImplementation(async (path, init) => {
      if (path.startsWith("/operations/")) throw Error("offline lookup");
      return original(path, init);
    });
    await controller.refresh(true);
    expect(controller.snapshot().pending).not.toBeNull();
    expect(puts(f)).toHaveLength(1);
  });

  it("requires conflict review before overwriting another server revision", async () => {
    const f = fixture(),
      controller = f.create();
    await controller.start(false);
    await controller.update("budget_reminder", true, "06:30", false);
    f.setServer({ ...defaultPreferences(), revision: 2 });
    await controller.refresh(true);
    expect(controller.snapshot().conflict?.revision).toBe(2);
    expect(puts(f)).toHaveLength(0);
    await expect(
      controller.update("record_reminder", true, "21:00", true),
    ).rejects.toThrow("Tinjau perbedaan");
    await controller.resolveConflict("local", true);
    expect(puts(f)).toHaveLength(1);
    expect(JSON.parse(puts(f)[0]?.[1]?.body as string).expected_revision).toBe(
      2,
    );
    expect(f.server().budget_reminder.time).toBe("06:30");
    expect(controller.snapshot().conflict).toBeNull();
  });

  it("preserves local choices on HTTP 409 until the user chooses server settings", async () => {
    const f = fixture(),
      controller = f.create();
    await controller.start(true);
    f.setWriteMode("conflict");
    await controller.update("record_reminder", true, "21:30", true);
    expect(controller.snapshot().conflict?.revision).toBe(1);
    expect(controller.snapshot().preferences.record_reminder.time).toBe(
      "21:30",
    );
    await controller.resolveConflict("server", true);
    expect(controller.snapshot().preferences.record_reminder).toEqual(
      defaultPreferences().record_reminder,
    );
    expect(controller.snapshot().dirty).toBe(false);
    expect(puts(f)).toHaveLength(1);
  });

  it("does not send a mutation if pending command cannot be saved privately", async () => {
    const f = fixture(),
      controller = f.create();
    await controller.start(true);
    const save = f.store.set.getMockImplementation()!;
    f.store.set.mockImplementation(async (value) => {
      if (value.pending) throw Error("secure store unavailable");
      return save(value);
    });
    await controller.update("budget_reminder", true, "07:30", true);
    expect(puts(f)).toHaveLength(0);
    expect(controller.snapshot().pending).toBeNull();
    expect(controller.snapshot().dirty).toBe(true);
  });
});
