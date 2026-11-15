import { z } from "zod";

export const kinds = ["budget_reminder", "record_reminder"] as const;
export type Kind = (typeof kinds)[number];
export const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const settingSchema = z.object({ enabled: z.boolean(), time: timeSchema });
export const preferencesSchema = z.object({
  budget_reminder: settingSchema,
  record_reminder: settingSchema,
  revision: z.number().int().nonnegative(),
});
export type Preferences = z.infer<typeof preferencesSchema>;
export const defaults = (): Preferences => ({
  budget_reminder: { enabled: false, time: "08:00" },
  record_reminder: { enabled: false, time: "20:00" },
  revision: 0,
});
export const copy = {
  budget_reminder: {
    title: "Cek budget hari ini",
    body: "Cek budget hari ini sebelum mulai aktivitas.",
  },
  record_reminder: {
    title: "Waktunya mencatat",
    body: "Luangkan sebentar untuk mencatat pengeluaran hari ini.",
  },
};
export const pendingSchema = z.object({ key: z.string(), body: z.string() });
export const storedSchema = z.object({
  preferences: preferencesSchema,
  dirty: z.boolean(),
  pending: pendingSchema.nullable(),
  ids: z.record(z.string(), z.string()),
});
export type Stored = z.infer<typeof storedSchema>;
export const emptyStore = (): Stored => ({
  preferences: defaults(),
  dirty: false,
  pending: null,
  ids: {},
});
export type Permission = {
  granted: boolean;
  canAskAgain: boolean;
  channelEnabled: boolean;
};
export type Scheduled = {
  id: string;
  owner?: string;
  kind?: string;
  time?: string;
  zone?: string;
  validDaily: boolean;
};
export type Device = {
  prepare(): Promise<void>;
  permission(request: boolean): Promise<Permission>;
  list(): Promise<Scheduled[]>;
  schedule(
    uid: string,
    kind: Kind,
    time: string,
    zone: string,
  ): Promise<string>;
  cancel(id: string): Promise<void>;
  dismiss(uid: string): Promise<void>;
  test(uid: string): Promise<void>;
  zone(): string;
};
export type Storage = {
  load(): Promise<Stored | null>;
  save(value: Stored): Promise<void>;
};
export type Request = <T>(
  path: string,
  init?: RequestInit,
) => Promise<{ status: number; data: T }>;
