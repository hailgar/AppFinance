import { ApiError } from "../services/api";

export const reminderKinds = ["budget_reminder", "record_reminder"] as const;
export type ReminderKind = (typeof reminderKinds)[number];
export type Reminder = { enabled: boolean; time: string };
export type Preferences = {
  budget_reminder: Reminder;
  record_reminder: Reminder;
  revision: number;
};
export type Permission = {
  granted: boolean;
  status: string;
  canAskAgain: boolean;
};
export type Scheduled = {
  id: string;
  uid: string;
  kind: ReminderKind | "test";
  time: string | null;
  zone: string;
};
export interface ReminderDevice {
  prepare(): Promise<void>;
  permission(): Promise<Permission>;
  requestPermission(): Promise<Permission>;
  scheduled(): Promise<Scheduled[]>;
  schedule(
    uid: string,
    kind: ReminderKind,
    time: string,
    zone: string,
  ): Promise<string>;
  cancel(id: string): Promise<void>;
  test(uid: string): Promise<void>;
}
export type Pending = { key: string; body: string };
export type SavedReminders = {
  preferences: Preferences;
  dirty: boolean;
  pending: Pending | null;
  conflict: Preferences | null;
  ids: Partial<Record<ReminderKind, string>>;
};
export interface ReminderStore {
  get(): Promise<SavedReminders | null>;
  set(value: SavedReminders): Promise<void>;
  clear(): Promise<void>;
}
export type ReminderRequest = <T>(
  path: string,
  init?: RequestInit,
) => Promise<{ status: number; data: T }>;
export type ReminderState = SavedReminders & {
  ready: boolean;
  serverChecked: boolean;
  permission: Permission;
  active: Record<ReminderKind, boolean>;
  error: string | null;
};
export const defaultPreferences = (): Preferences => ({
  budget_reminder: { enabled: false, time: "08:00" },
  record_reminder: { enabled: false, time: "20:00" },
  revision: 0,
});
export const validTime = (value: string) =>
  /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
export function parsePreferences(value: unknown): Preferences {
  if (!value || typeof value !== "object")
    throw Error("Pengaturan pengingat tidak valid.");
  const p = value as Record<string, unknown>;
  if (!Number.isSafeInteger(p.revision) || (p.revision as number) < 0)
    throw Error("Revisi pengingat tidak valid.");
  for (const kind of reminderKinds) {
    const item = p[kind] as Reminder | undefined;
    if (
      !item ||
      typeof item.enabled !== "boolean" ||
      typeof item.time !== "string" ||
      !validTime(item.time)
    )
      throw Error("Jam pengingat tidak valid.");
  }
  return {
    budget_reminder: { ...(p.budget_reminder as Reminder) },
    record_reminder: { ...(p.record_reminder as Reminder) },
    revision: p.revision as number,
  };
}
export function parseSaved(value: unknown): SavedReminders {
  if (!value || typeof value !== "object")
    throw Error("Pengaturan lokal belum bisa dibaca.");
  const p = value as SavedReminders;
  const preferences = parsePreferences(p.preferences);
  if (typeof p.dirty !== "boolean")
    throw Error("Status pengingat lokal tidak valid.");
  let pending: Pending | null = null;
  if (p.pending) {
    if (
      typeof p.pending.key !== "string" ||
      !/^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i.test(p.pending.key) ||
      typeof p.pending.body !== "string"
    )
      throw Error("Pemulihan pengingat tidak valid.");
    const body = JSON.parse(p.pending.body);
    parsePreferences({ ...body, revision: body.expected_revision });
    pending = { ...p.pending };
  }
  return {
    preferences,
    dirty: p.dirty,
    pending,
    conflict: p.conflict ? parsePreferences(p.conflict) : null,
    ids: p.ids || {},
  };
}

/** Pure coordinator. Only local preferences may be deferred; this is not a transaction queue. */
export class ReminderController {
  private stopped = false;
  private tail: Promise<unknown> = Promise.resolve();
  private state: ReminderState = {
    preferences: defaultPreferences(),
    dirty: false,
    pending: null,
    conflict: null,
    ids: {},
    ready: false,
    serverChecked: false,
    permission: { granted: false, status: "undetermined", canAskAgain: true },
    active: { budget_reminder: false, record_reminder: false },
    error: null,
  };
  private listeners = new Set<(state: ReminderState) => void>();
  constructor(
    readonly uid: string,
    private store: ReminderStore,
    private device: ReminderDevice,
    private request: ReminderRequest,
    private uuid: () => string,
    private zone: () => string,
  ) {}
  snapshot = () => this.state;
  subscribe = (listener: (state: ReminderState) => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(next: Partial<ReminderState>) {
    this.state = { ...this.state, ...next };
    if (!this.stopped)
      this.listeners.forEach((listener) => listener(this.state));
  }
  private queue<T>(work: () => Promise<T>): Promise<T> {
    const run = this.tail.then(async () => {
      if (this.stopped) throw Error("Sesi pengingat sudah ditutup.");
      return work();
    });
    this.tail = run.catch(() => undefined);
    return run;
  }
  private async persist(next: Partial<SavedReminders> = {}) {
    if (this.stopped) return;
    const saved: SavedReminders = {
      preferences: this.state.preferences,
      dirty: this.state.dirty,
      pending: this.state.pending,
      conflict: this.state.conflict,
      ids: this.state.ids,
      ...next,
    };
    await this.store.set(saved);
    if (!this.stopped) this.publish(saved);
  }
  private async reconcile() {
    await this.device.prepare();
    const permission = await this.device.permission();
    const scheduled = await this.device.scheduled();
    const zone = this.zone();
    const keep = new Set<string>();
    for (const kind of reminderKinds) {
      const setting = this.state.preferences[kind];
      if (!permission.granted || !setting.enabled || this.stopped) continue;
      const existing = scheduled.find(
        (s) =>
          s.uid === this.uid &&
          s.kind === kind &&
          s.time === setting.time &&
          s.zone === zone,
      );
      if (existing) keep.add(existing.id);
    }
    // Remove only this app's tagged reminders, including stale reminders from another account.
    for (const item of scheduled) {
      if (!keep.has(item.id) && item.kind !== "test")
        await this.device.cancel(item.id);
    }
    for (const kind of reminderKinds) {
      const setting = this.state.preferences[kind];
      const exists = scheduled.some((s) => keep.has(s.id) && s.kind === kind);
      if (!this.stopped && permission.granted && setting.enabled && !exists)
        await this.device.schedule(this.uid, kind, setting.time, zone);
    }
    if (this.stopped) return;
    const actual = await this.device.scheduled();
    const ids: Partial<Record<ReminderKind, string>> = {};
    const active = { budget_reminder: false, record_reminder: false };
    for (const kind of reminderKinds) {
      const setting = this.state.preferences[kind];
      const found = actual.find(
        (s) =>
          s.uid === this.uid &&
          s.kind === kind &&
          s.time === setting.time &&
          s.zone === zone,
      );
      if (permission.granted && setting.enabled && found) {
        ids[kind] = found.id;
        active[kind] = true;
      }
    }
    this.publish({ permission, active });
    await this.persist({ ids });
  }
  private async adoptServer(value: unknown) {
    const preferences = parsePreferences(value);
    await this.persist({
      preferences,
      dirty: false,
      pending: null,
      conflict: null,
    });
    if (!this.stopped) this.publish({ serverChecked: true });
  }
  private async sync() {
    if (this.stopped) return;
    const pending = this.state.pending;
    if (pending) {
      const receipt = await this.request<{ status: string; data?: unknown }>(
        "/operations/" + pending.key,
      );
      if (this.stopped) return;
      if (receipt.data.status === "APPLIED") {
        await this.adoptServer(receipt.data.data);
      } else if (receipt.data.status === "CONFLICT") {
        const server = await this.request<Preferences>("/preferences");
        await this.persist({
          pending: null,
          conflict: parsePreferences(server.data),
          dirty: true,
        });
        return;
      } else if (receipt.data.status !== "UNKNOWN") {
        throw Error("Status pencadangan pengingat belum bisa dipastikan.");
      }
    }
    if (this.state.conflict || this.stopped) return;
    if (!this.state.pending) {
      const response = await this.request<Preferences>("/preferences");
      if (this.stopped) return;
      const server = parsePreferences(response.data);
      if (!this.state.dirty) {
        await this.adoptServer(server);
        return;
      }
      if (server.revision !== this.state.preferences.revision) {
        await this.persist({ conflict: server });
        return;
      }
      const { revision, ...settings } = this.state.preferences;
      await this.persist({
        pending: {
          key: this.uuid(),
          body: JSON.stringify({ ...settings, expected_revision: revision }),
        },
      });
    }
    if (this.stopped) return;
    const command = this.state.pending!;
    try {
      const result = await this.request<Preferences>("/preferences", {
        method: "PUT",
        headers: { "Idempotency-Key": command.key },
        body: command.body,
      });
      if (this.stopped || result.status === 202) return;
      await this.adoptServer(result.data);
    } catch (error) {
      if (this.stopped) return;
      if (error instanceof ApiError && error.status === 409) {
        const server = await this.request<Preferences>("/preferences");
        await this.persist({
          pending: null,
          conflict: parsePreferences(server.data),
          dirty: true,
        });
      } else if (
        error instanceof ApiError &&
        [400, 404, 422].includes(error.status)
      ) {
        await this.persist({ pending: null });
        throw error;
      } else {
        // Preserve body/key after a timeout, upstream failure, or malformed response.
        throw error;
      }
    }
  }
  start(online: boolean) {
    const run = this.tail.then(async () => {
      this.stopped = false;
      const saved = await this.store.get();
      if (saved) this.publish(parseSaved(saved));
      this.publish({ ready: true });
      await this.refreshInside(online);
    });
    this.tail = run.catch(() => undefined);
    return run;
  }
  private async refreshInside(online: boolean) {
    this.publish({ error: null });
    await this.reconcile();
    if (online && !this.stopped) {
      try {
        await this.sync();
      } catch {
        this.publish({
          error:
            "Pengaturan tetap tersedia di perangkat. Pencadangan belum bisa diperiksa.",
        });
      }
      await this.reconcile();
    }
  }
  refresh(online: boolean) {
    return this.queue(() => this.refreshInside(online));
  }
  update(kind: ReminderKind, enabled: boolean, time: string, online: boolean) {
    return this.queue(async () => {
      if (!validTime(time)) throw Error("Gunakan jam 24 jam, misalnya 08:00.");
      if (this.state.pending)
        throw Error(
          "Periksa pencadangan sebelumnya sebelum mengubah pengingat.",
        );
      if (this.state.conflict)
        throw Error("Tinjau perbedaan pengaturan server terlebih dahulu.");
      if (enabled) {
        await this.device.prepare();
        const permission = await this.device.permission();
        // Only a direct enabling action may show the first permission prompt.
        if (
          !permission.granted &&
          permission.status === "undetermined" &&
          permission.canAskAgain
        )
          await this.device.requestPermission();
      }
      await this.persist({
        preferences: { ...this.state.preferences, [kind]: { enabled, time } },
        dirty: true,
      });
      await this.refreshInside(online);
    });
  }
  resolveConflict(choice: "server" | "local", online: boolean) {
    return this.queue(async () => {
      const server = this.state.conflict;
      if (!server) return;
      if (choice === "server") await this.adoptServer(server);
      else
        await this.persist({
          preferences: { ...this.state.preferences, revision: server.revision },
          conflict: null,
          dirty: true,
        });
      await this.refreshInside(online);
    });
  }
  test() {
    return this.queue(async () => {
      await this.device.prepare();
      let permission = await this.device.permission();
      if (
        !permission.granted &&
        permission.status === "undetermined" &&
        permission.canAskAgain
      )
        permission = await this.device.requestPermission();
      this.publish({ permission });
      if (!permission.granted)
        throw Error(
          "Izinkan notifikasi melalui pengaturan Android terlebih dahulu.",
        );
      await this.device.test(this.uid);
    });
  }
  /** Stop synchronously prevents in-flight work scheduling again; await before logout. */
  stop(clearSaved = true) {
    this.stopped = true;
    const run = this.tail.then(async () => {
      const actual = await this.device.scheduled();
      for (const item of actual)
        if (item.uid === this.uid) await this.device.cancel(item.id);
      if (clearSaved) await this.store.clear();
    });
    this.tail = run.catch(() => undefined);
    return run;
  }
  /** Restore settings/pending backup when native sign-out fails and the account remains active. */
  resume(online: boolean) {
    const run = this.tail.then(async () => {
      this.stopped = false;
      await this.persist();
      await this.refreshInside(online);
    });
    this.tail = run.catch(() => undefined);
    return run;
  }
}
