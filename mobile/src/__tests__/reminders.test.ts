import { describe, expect, it, vi } from "vitest";
import { ReminderController } from "../reminders/controller";
import {
  defaults,
  emptyStore,
  timeSchema,
  type Device,
  type Preferences,
  type Request,
  type Scheduled,
  type Storage,
  type Stored,
} from "../reminders/model";
import { ApiError } from "../services/api";

function fixture(initial?: Stored) {
  let persisted: Stored | null = initial ? structuredClone(initial) : null;
  const storage: Storage = {
    load: vi.fn(async () => structuredClone(persisted)),
    save: vi.fn(async (value) => {
      persisted = structuredClone(value);
    }),
  };
  let scheduled: Scheduled[] = [],
    nextId = 0,
    zone = "Asia/Jakarta";
  const permission = {
    granted: true,
    canAskAgain: false,
    channelEnabled: true,
  };
  const device: Device = {
    prepare: vi.fn(async () => {}),
    permission: vi.fn(async () => ({ ...permission })),
    list: vi.fn(async () => structuredClone(scheduled)),
    schedule: vi.fn(async (uid, kind, time, z) => {
      const id = `schedule-${++nextId}`;
      scheduled.push({ id, owner: uid, kind, time, zone: z, validDaily: true });
      return id;
    }),
    cancel: vi.fn(async (id) => {
      scheduled = scheduled.filter((n) => n.id !== id);
    }),
    dismiss: vi.fn(async () => {}),
    test: vi.fn(async () => {}),
    zone: () => zone,
  };
  let remote = defaults(),
    losePut = false,
    rejectPut = false;
  const receipts = new Map<string, Preferences>();
  const request = vi.fn(
    async (
      path: string,
      init?: RequestInit,
    ): Promise<{ status: number; data: unknown }> => {
      if (path.startsWith("/operations/")) {
        const data = receipts.get(path.slice("/operations/".length));
        return {
          status: data ? 200 : 202,
          data: data ? { status: "APPLIED", data } : { status: "UNKNOWN" },
        };
      }
      if (init?.method === "PUT") {
        if (rejectPut) throw new ApiError(409, "REVISION_CONFLICT");
        const body = JSON.parse(String(init.body));
        const key = (init.headers as Record<string, string>)[
          "Idempotency-Key"
        ]!;
        if (body.expected_revision !== remote.revision)
          throw new ApiError(409, "REVISION_CONFLICT");
        remote = {
          budget_reminder: body.budget_reminder,
          record_reminder: body.record_reminder,
          revision: remote.revision + 1,
        };
        receipts.set(key, structuredClone(remote));
        if (losePut) throw Error("response lost");
        return { status: 200, data: remote };
      }
      return { status: 200, data: structuredClone(remote) };
    },
  );
  return {
    create: () =>
      new ReminderController(
        "owner",
        storage,
        device,
        request as Request,
        () => `operation-${++nextId}`,
      ),
    storage,
    device,
    request,
    permission,
    writes: () =>
      request.mock.calls.filter((call) => call[1]?.method === "PUT"),
    persisted: () => structuredClone(persisted),
    scheduled: () => structuredClone(scheduled),
    add: (n: Scheduled) => scheduled.push(n),
    clear: () => {
      scheduled = [];
    },
    changeZone: () => {
      zone = "Asia/Makassar";
    },
    remote: (p: Preferences) => {
      remote = p;
    },
    loseResponse: () => {
      losePut = true;
    },
    rejectWrite: () => {
      rejectPut = true;
    },
  };
}
const enabled = () => ({
  ...emptyStore(),
  preferences: {
    ...defaults(),
    budget_reminder: { enabled: true, time: "08:00" },
  },
});

describe("Android reminder lifecycle", () => {
  it("starts disabled without requesting permission or scheduling", async () => {
    const f = fixture(),
      c = f.create();
    await c.start();
    expect(c.getSnapshot().preferences).toEqual(defaults());
    expect(f.scheduled()).toHaveLength(0);
    expect(f.device.permission).not.toHaveBeenCalledWith(true);
  });
  it("retains intent after permission denial and never asks again on resume", async () => {
    const f = fixture(),
      c = f.create();
    f.permission.granted = false;
    await c.start();
    await c.change("budget_reminder", { enabled: true, time: "08:00" });
    await c.refresh();
    expect(c.getSnapshot().preferences.budget_reminder.enabled).toBe(true);
    expect(c.getSnapshot().active).toEqual({});
    expect(f.device.permission).not.toHaveBeenCalledWith(true);
    await c.test();
    expect(f.device.test).not.toHaveBeenCalled();
  });
  it("does not show a blocked channel as an active schedule", async () => {
    const f = fixture(enabled()),
      c = f.create();
    f.permission.channelEnabled = false;
    await c.start();
    expect(c.getSnapshot().permission?.channelEnabled).toBe(false);
    expect(f.scheduled()).toHaveLength(0);
  });
  it("serializes simultaneous resumes without duplicates", async () => {
    const f = fixture(enabled()),
      c = f.create();
    await c.start();
    await Promise.all([c.refresh(), c.refresh(), c.refresh()]);
    expect(f.scheduled()).toHaveLength(1);
    expect(f.device.schedule).toHaveBeenCalledTimes(1);
  });
  it("cancels stale times, duplicates and old account schedules before replacement", async () => {
    const f = fixture(enabled()),
      c = f.create();
    await c.start();
    const original = f.scheduled()[0]!;
    f.add({ ...original, id: "duplicate" });
    f.add({ ...original, id: "other", owner: "old-account" });
    await c.change("budget_reminder", { enabled: true, time: "09:30" });
    expect(f.scheduled()).toHaveLength(1);
    expect(f.scheduled()[0]?.time).toBe("09:30");
    await c.change("budget_reminder", { enabled: false, time: "09:30" });
    expect(f.scheduled()).toHaveLength(0);
  });
  it("rebuilds missing schedules after restart and replaces them after timezone changes", async () => {
    const f = fixture(enabled());
    await f.create().start();
    f.clear();
    const c = f.create();
    await c.start();
    expect(f.scheduled()).toHaveLength(1);
    f.changeZone();
    await c.refresh();
    expect(f.scheduled()).toHaveLength(1);
    expect(f.scheduled()[0]?.zone).toBe("Asia/Makassar");
  });
  it("rejects malformed actual triggers despite matching metadata", async () => {
    const f = fixture(enabled()),
      c = f.create();
    f.add({
      id: "wrong-trigger",
      owner: "owner",
      kind: "budget_reminder",
      time: "08:00",
      zone: "Asia/Jakarta",
      validDaily: false,
    });
    await c.start();
    expect(f.scheduled()).toHaveLength(1);
    expect(f.scheduled()[0]?.id).not.toBe("wrong-trigger");
  });
  it("checks OS registration instead of trusting schedule's return value", async () => {
    const f = fixture(enabled()),
      c = f.create();
    f.device.schedule = vi.fn(async () => "missing");
    await c.start();
    expect(c.getSnapshot().active).toEqual({});
  });
  it("persists and schedules offline without a server request", async () => {
    const f = fixture(),
      c = f.create();
    await c.start();
    await c.change("record_reminder", { enabled: true, time: "21:15" });
    expect(f.request).not.toHaveBeenCalled();
    expect(f.persisted()?.preferences.record_reminder.time).toBe("21:15");
    expect(f.scheduled()).toHaveLength(1);
    expect(c.getSnapshot().backup).toBe("local");
  });
  it("does not schedule a change if durable storage fails", async () => {
    const f = fixture(),
      c = f.create();
    await c.start();
    f.storage.save = async () => {
      throw Error("disk full");
    };
    await c.change("record_reminder", { enabled: true, time: "21:15" });
    expect(f.scheduled()).toHaveLength(0);
    expect(c.getSnapshot().preferences.record_reminder.enabled).toBe(false);
    expect(c.getSnapshot().error).toBeTruthy();
  });
  it("cancels daily and test notifications on logout and keeps preferences", async () => {
    const f = fixture(enabled()),
      c = f.create();
    await c.start();
    f.add({ id: "test", owner: "owner", kind: "test", validDaily: false });
    await c.stop();
    await c.refresh();
    expect(f.scheduled()).toHaveLength(0);
    expect(f.persisted()?.preferences.budget_reminder.enabled).toBe(true);
    expect(f.device.dismiss).toHaveBeenCalledWith("owner");
  });
  it("does not report logout cleanup success when native cancellation fails", async () => {
    const f = fixture(enabled()),
      c = f.create();
    await c.start();
    f.device.cancel = async () => {
      throw Error("native");
    };
    await expect(c.stop()).rejects.toThrow("REMINDER_ACTION_FAILED");
  });
});

describe("reminder backup", () => {
  it("backs up dirty preferences with the server revision", async () => {
    const f = fixture(),
      c = f.create();
    await c.start();
    await c.change("record_reminder", { enabled: true, time: "22:00" });
    await c.sync();
    expect(c.getSnapshot().backup).toBe("saved");
    expect(f.persisted()?.pending).toBeNull();
    expect(c.getSnapshot().preferences.revision).toBe(1);
    expect(f.writes()[0]?.[1]?.body).toContain('"expected_revision":0');
  });
  it("recovers lost PUT response after restart by receipt without a second PUT", async () => {
    const f = fixture(),
      c = f.create();
    await c.start();
    f.loseResponse();
    await c.change("record_reminder", { enabled: true, time: "22:00" });
    await c.sync();
    expect(c.getSnapshot().backup).toBe("uncertain");
    const restarted = f.create();
    await restarted.start();
    await restarted.sync();
    expect(restarted.getSnapshot().backup).toBe("saved");
    expect(f.writes()).toHaveLength(1);
  });
  it("allows disabling during UNKNOWN and preserves it when an older receipt arrives", async () => {
    const f = fixture(),
      c = f.create();
    await c.start();
    f.loseResponse();
    await c.change("budget_reminder", { enabled: true, time: "08:00" });
    await c.sync();
    await c.change("budget_reminder", { enabled: false, time: "08:00" });
    expect(f.scheduled()).toHaveLength(0);
    await c.sync();
    expect(c.getSnapshot().preferences.budget_reminder.enabled).toBe(false);
    expect(c.getSnapshot().backup).toBe("local");
    expect(f.persisted()?.dirty).toBe(true);
  });
  it("only explicitly retries UNKNOWN with the same key and body", async () => {
    const initial = enabled();
    initial.dirty = true;
    const pending = {
      key: "same-key",
      body: JSON.stringify({
        budget_reminder: initial.preferences.budget_reminder,
        record_reminder: initial.preferences.record_reminder,
        expected_revision: 0,
      }),
    };
    const f = fixture({ ...initial, pending }),
      c = f.create();
    await c.start();
    await c.sync();
    expect(f.writes()).toHaveLength(0);
    await c.sync(true);
    expect(f.writes()[0]?.[1]?.body).toBe(pending.body);
    expect(f.writes()[0]?.[1]?.headers).toEqual({
      "Idempotency-Key": "same-key",
    });
  });
  it("requires an explicit choice on revision conflict and can use server settings", async () => {
    const f = fixture(),
      c = f.create();
    await c.start();
    await c.change("budget_reminder", { enabled: true, time: "08:00" });
    f.remote({ ...defaults(), revision: 2 });
    await c.sync();
    await c.sync();
    expect(c.getSnapshot().backup).toBe("conflict");
    expect(f.writes()).toHaveLength(0);
    await c.resolve(false);
    expect(c.getSnapshot().preferences.budget_reminder.enabled).toBe(false);
    expect(f.scheduled()).toHaveLength(0);
  });
  it("uses reviewed remote revision when explicitly keeping device preferences", async () => {
    const f = fixture(),
      c = f.create();
    await c.start();
    await c.change("budget_reminder", { enabled: true, time: "08:00" });
    f.remote({ ...defaults(), revision: 2 });
    await c.sync();
    await c.resolve(true);
    await c.sync();
    expect(c.getSnapshot().preferences.revision).toBe(3);
    expect(c.getSnapshot().preferences.budget_reminder.enabled).toBe(true);
  });
  it("handles revision race during PUT as a conflict without overwriting local intent", async () => {
    const f = fixture(),
      c = f.create();
    await c.start();
    f.rejectWrite();
    await c.change("budget_reminder", { enabled: true, time: "08:00" });
    await c.sync();
    expect(c.getSnapshot().backup).toBe("conflict");
    expect(c.getSnapshot().preferences.budget_reminder.enabled).toBe(true);
    expect(f.persisted()?.pending).toBeNull();
  });
  it("cannot recreate schedules when logout interrupts an in-flight server read", async () => {
    const f = fixture(),
      c = f.create();
    await c.start();
    let complete!: (value: { status: number; data: unknown }) => void;
    f.request.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const syncing = c.sync();
    await vi.waitFor(() => expect(complete).toBeDefined());
    const stopping = c.stop();
    complete({
      status: 200,
      data: {
        ...defaults(),
        budget_reminder: { enabled: true, time: "08:00" },
      },
    });
    await Promise.all([syncing, stopping]);
    expect(f.scheduled()).toHaveLength(0);
  });
});
it("accepts midnight but rejects invalid 24-hour times", () => {
  expect(timeSchema.parse("00:00")).toBe("00:00");
  for (const value of ["24:00", "9:00", "12:60", "08.00"])
    expect(timeSchema.safeParse(value).success).toBe(false);
});
