import { ApiError } from "../services/api";
import type { Operation } from "../services/commands";
import {
  emptyStore,
  kinds,
  preferencesSchema,
  storedSchema,
  timeSchema,
  type Device,
  type Kind,
  type Permission,
  type Preferences,
  type Request,
  type Storage,
  type Stored,
} from "./model";

// Shared lane prevents an old account's cleanup racing a new account's scheduling.
let lane: Promise<unknown> = Promise.resolve();
export function withDeviceLock(job: () => Promise<void>) {
  const task = lane.catch(() => undefined).then(job);
  lane = task.catch(() => undefined);
  return task;
}
export type Snapshot = {
  ready: boolean;
  preferences: Preferences;
  permission: Permission | null;
  active: Partial<Record<Kind, string>>;
  backup: "loading" | "saved" | "local" | "uncertain" | "conflict";
  conflict: Preferences | null;
  error: string;
};
export class ReminderController {
  private stored: Stored = emptyStore();
  private stopped = true;
  private loaded = false;
  private listeners = new Set<() => void>();
  private snapshot: Snapshot = {
    ready: false,
    preferences: this.stored.preferences,
    permission: null,
    active: {},
    backup: "loading",
    conflict: null,
    error: "",
  };
  constructor(
    readonly uid: string,
    private storage: Storage,
    private device: Device,
    private request: Request,
    private uuid: () => string,
  ) {}
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.snapshot;
  private publish(patch: Partial<Snapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((listener) => listener());
  }
  private enqueue(job: () => Promise<void>, propagate = false) {
    const task = withDeviceLock(job);
    return task.catch(() => {
      this.publish({
        error: "Pengaturan pengingat belum selesai. Coba periksa kembali.",
      });
      if (propagate) throw Error("REMINDER_ACTION_FAILED");
    });
  }
  private async save() {
    await this.storage.save(this.stored);
    this.publish({ preferences: this.stored.preferences });
  }
  start = () => {
    this.stopped = false;
    return this.enqueue(async () => {
      if (this.stopped) return;
      if (!this.loaded) {
        const value = await this.storage.load();
        this.stored = value ? storedSchema.parse(value) : emptyStore();
        this.loaded = true;
      }
      this.publish({
        ready: true,
        preferences: this.stored.preferences,
        backup: this.stored.pending ? "uncertain" : "local",
      });
      await this.reconcile();
    });
  };
  refresh = () =>
    this.enqueue(async () => {
      if (!this.loaded || this.stopped) return;
      this.publish({ error: "" });
      await this.reconcile();
    });
  private async reconcile() {
    if (this.stopped) return;
    await this.device.prepare();
    const permission = await this.device.permission(false);
    this.publish({ permission, active: {} });
    const zone = this.device.zone();
    const scheduled = await this.device.list();
    const ids: Record<string, string> = {};
    for (const item of scheduled) {
      // This adapter lists only reminders owned by this application feature.
      const kind = kinds.find((k) => k === item.kind);
      const setting = kind && this.stored.preferences[kind];
      if (
        item.owner === this.uid &&
        kind &&
        setting?.enabled &&
        permission.granted &&
        permission.channelEnabled &&
        item.validDaily &&
        item.time === setting.time &&
        item.zone === zone &&
        !ids[kind]
      ) {
        ids[kind] = item.id;
      } else if (
        item.kind !== "test" ||
        item.owner !== this.uid ||
        !permission.granted ||
        !permission.channelEnabled
      ) {
        await this.device.cancel(item.id);
      }
    }
    for (const kind of kinds) {
      if (this.stopped) return;
      const setting = this.stored.preferences[kind];
      if (
        setting.enabled &&
        permission.granted &&
        permission.channelEnabled &&
        !ids[kind]
      ) {
        ids[kind] = await this.device.schedule(
          this.uid,
          kind,
          setting.time,
          zone,
        );
      }
    }
    // Re-read OS state: schedule() success alone is not proof of registration.
    const actual = await this.device.list();
    const active: Partial<Record<Kind, string>> = {};
    for (const kind of kinds) {
      if (
        actual.some(
          (item) =>
            item.id === ids[kind] && item.owner === this.uid && item.validDaily,
        )
      )
        active[kind] = ids[kind];
    }
    this.stored.ids = active;
    await this.save();
    if (!this.stopped) this.publish({ active });
  }
  change = (kind: Kind, setting: { enabled: boolean; time: string }) =>
    this.enqueue(async () => {
      if (this.stopped || !this.loaded) return;
      timeSchema.parse(setting.time);
      this.publish({ error: "" });
      // Persist intent before touching the OS. A failed permission prompt must not lose it.
      const previous = this.stored;
      this.stored = {
        ...this.stored,
        dirty: true,
        preferences: { ...this.stored.preferences, [kind]: setting },
      };
      try {
        await this.save();
      } catch (error) {
        this.stored = previous;
        throw error;
      }
      this.publish({
        backup: this.stored.pending
          ? "uncertain"
          : this.snapshot.conflict
            ? "conflict"
            : "local",
      });
      if (setting.enabled && !this.snapshot.permission?.granted) {
        await this.device.prepare();
        const current = await this.device.permission(false);
        if (current.canAskAgain) await this.device.permission(true);
      }
      await this.reconcile();
    });
  requestPermission = () =>
    this.enqueue(async () => {
      if (this.stopped) return;
      await this.device.prepare();
      const permission = await this.device.permission(false);
      if (!permission.granted && permission.canAskAgain)
        await this.device.permission(true);
      await this.reconcile();
    });
  test = () =>
    this.enqueue(async () => {
      if (this.stopped) return;
      await this.reconcile();
      if (
        !this.snapshot.permission?.granted ||
        !this.snapshot.permission.channelEnabled
      ) {
        this.publish({
          error:
            "Izinkan notifikasi dan aktifkan kanal pengingat di pengaturan perangkat terlebih dahulu.",
        });
        return;
      }
      await this.device.test(this.uid);
    });
  sync = (retryUnknown = false) =>
    this.enqueue(async () => {
      if (this.stopped || !this.loaded) return;
      this.publish({ error: "" });
      try {
        if (this.stored.pending) {
          const result = await this.request<Operation>(
            "/operations/" + this.stored.pending.key,
          );
          if (this.stopped) return;
          if (result.data.status === "APPLIED") {
            await this.settlePending(preferencesSchema.parse(result.data.data));
            return;
          }
          if (result.data.status === "CONFLICT") {
            await this.conflict();
            return;
          }
          if (!retryUnknown) {
            this.publish({ backup: "uncertain" });
            return;
          }
          await this.sendPending();
          return;
        }
        const { data } = await this.request<Preferences>("/preferences");
        if (this.stopped) return;
        const remote = preferencesSchema.parse(data);
        if (this.snapshot.conflict) {
          this.publish({ conflict: remote, backup: "conflict" });
          return;
        }
        if (!this.stored.dirty) {
          await this.accept(remote);
          return;
        }
        if (remote.revision !== this.stored.preferences.revision) {
          this.publish({ conflict: remote, backup: "conflict" });
          return;
        }
        const { revision, ...settings } = this.stored.preferences;
        this.stored.pending = {
          key: this.uuid(),
          body: JSON.stringify({ ...settings, expected_revision: revision }),
        };
        await this.save();
        this.publish({ backup: "uncertain" });
        await this.sendPending();
      } catch {
        if (!this.stopped)
          this.publish({
            backup: this.stored.pending
              ? "uncertain"
              : this.snapshot.conflict
                ? "conflict"
                : "local",
          });
      }
    });
  private async sendPending() {
    const pending = this.stored.pending!;
    try {
      const result = await this.request<Preferences>("/preferences", {
        method: "PUT",
        body: pending.body,
        headers: { "Idempotency-Key": pending.key },
      });
      if (this.stopped) return;
      if (result.status === 202) {
        this.publish({ backup: "uncertain" });
        return;
      }
      await this.settlePending(preferencesSchema.parse(result.data));
    } catch (error) {
      if (this.stopped) return;
      if (error instanceof ApiError && error.status === 409) {
        await this.conflict();
        return;
      }
      if (error instanceof ApiError && [400, 404, 422].includes(error.status)) {
        this.stored.pending = null;
        await this.save();
        this.publish({
          backup: "local",
          error: "Pencadangan ditolak. Periksa pengaturan lalu coba lagi.",
        });
        return;
      }
      throw error;
    }
  }
  private async settlePending(preferences: Preferences) {
    const sent = JSON.parse(this.stored.pending!.body);
    const changed = kinds.some(
      (kind) =>
        sent[kind].enabled !== this.stored.preferences[kind].enabled ||
        sent[kind].time !== this.stored.preferences[kind].time,
    );
    if (!changed) {
      await this.accept(preferences);
      return;
    }
    this.stored = {
      ...this.stored,
      pending: null,
      dirty: true,
      preferences: {
        ...this.stored.preferences,
        revision: preferences.revision,
      },
    };
    await this.save();
    this.publish({ backup: "local", conflict: null });
    await this.reconcile();
  }
  private async accept(preferences: Preferences) {
    this.stored = { ...this.stored, preferences, dirty: false, pending: null };
    await this.save();
    this.publish({ backup: "saved", conflict: null });
    await this.reconcile();
  }
  private async conflict() {
    const { data } = await this.request<Preferences>("/preferences");
    if (this.stopped) return;
    const remote = preferencesSchema.parse(data);
    this.stored.pending = null;
    await this.save();
    this.publish({ conflict: remote, backup: "conflict" });
  }
  resolve = (useDevice: boolean) =>
    this.enqueue(async () => {
      if (this.stopped || !this.snapshot.conflict) return;
      const remote = this.snapshot.conflict;
      if (!useDevice) {
        await this.accept(remote);
        return;
      }
      this.stored.preferences = {
        ...this.stored.preferences,
        revision: remote.revision,
      };
      this.stored.dirty = true;
      await this.save();
      this.publish({ conflict: null, backup: "local" });
    });
  stop = () => {
    this.stopped = true; // Guards in-flight fetches before they can schedule again.
    return this.enqueue(async () => {
      const pending = await this.device.list();
      for (const item of pending)
        if (item.owner === this.uid) await this.device.cancel(item.id);
      await this.device.dismiss(this.uid);
      this.publish({ active: {} });
    }, true);
  };
}
