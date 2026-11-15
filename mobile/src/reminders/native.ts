import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import {
  parseSaved,
  type Permission,
  type ReminderDevice,
  type ReminderKind,
  type ReminderStore,
  type Scheduled,
} from "./controller";

export const REMINDER_CHANNEL = "daily-reminders";
const marker = "catat-harian-local-v1";
const storageKey = (uid: string) =>
  "reminders." +
  Array.from(uid)
    .map((c) => c.charCodeAt(0).toString(16))
    .join("-");
export const reminderStore = (uid: string): ReminderStore => ({
  get: async () => {
    const raw = await SecureStore.getItemAsync(storageKey(uid));
    return raw ? parseSaved(JSON.parse(raw)) : null;
  },
  set: async (value) => {
    await SecureStore.setItemAsync(storageKey(uid), JSON.stringify(value));
  },
  clear: () => SecureStore.deleteItemAsync(storageKey(uid)),
});

const body: Record<ReminderKind, string> = {
  budget_reminder: "Cek budget hari ini sebelum mulai aktivitas.",
  record_reminder: "Luangkan sebentar untuk mencatat pengeluaran hari ini.",
};
let handlerInstalled = false;
async function permission(): Promise<Permission> {
  const status = await Notifications.getPermissionsAsync();
  const channel =
    Platform.OS === "android"
      ? await Notifications.getNotificationChannelAsync(REMINDER_CHANNEL)
      : null;
  const channelBlocked =
    channel?.importance === Notifications.AndroidImportance.NONE;
  return {
    granted: status.granted && !channelBlocked,
    status: channelBlocked ? "blocked_channel" : status.status,
    canAskAgain: status.canAskAgain,
  };
}
export const reminderDevice: ReminderDevice = {
  prepare: async () => {
    if (!handlerInstalled) {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldPlaySound: true,
          shouldSetBadge: false,
          shouldShowBanner: true,
          shouldShowList: true,
        }),
      });
      handlerInstalled = true;
    }
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL, {
        name: "Pengingat harian",
        importance: Notifications.AndroidImportance.DEFAULT,
        sound: "default",
        lockscreenVisibility:
          Notifications.AndroidNotificationVisibility.PRIVATE,
      });
    }
  },
  permission,
  requestPermission: async () => {
    await Notifications.requestPermissionsAsync();
    return permission();
  },
  scheduled: async () => {
    const all = await Notifications.getAllScheduledNotificationsAsync();
    const owned: Scheduled[] = [];
    for (const item of all) {
      const data = item.content.data;
      if (
        data?.owner !== marker ||
        typeof data.uid !== "string" ||
        typeof data.zone !== "string"
      )
        continue;
      if (
        data.kind !== "budget_reminder" &&
        data.kind !== "record_reminder" &&
        data.kind !== "test"
      )
        continue;
      const trigger = item.trigger as unknown as Record<string, unknown> | null;
      const time =
        trigger &&
        trigger.type === "daily" &&
        typeof trigger.hour === "number" &&
        typeof trigger.minute === "number"
          ? `${String(trigger.hour).padStart(2, "0")}:${String(trigger.minute).padStart(2, "0")}`
          : null;
      owned.push({
        id: item.identifier,
        uid: data.uid,
        kind: data.kind,
        time,
        zone: data.zone,
      });
    }
    return owned;
  },
  schedule: (uid, kind, time, zone) => {
    const [hour, minute] = time.split(":").map(Number);
    return Notifications.scheduleNotificationAsync({
      content: {
        title: "Catat Harian",
        body: body[kind],
        sound: "default",
        data: { owner: marker, uid, kind, zone },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: hour!,
        minute: minute!,
        channelId: REMINDER_CHANNEL,
      },
    });
  },
  cancel: (id) => Notifications.cancelScheduledNotificationAsync(id),
  test: async (uid) => {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Catat Harian",
        body: "Pengingat siap. Luangkan waktu untuk mencatat hari ini.",
        sound: "default",
        data: {
          owner: marker,
          uid,
          kind: "test",
          zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: 2,
        channelId: REMINDER_CHANNEL,
      },
    });
  },
};

/** Fallback cleanup when the account provider is not mounted (e.g. recovery/login gate). */
export async function clearNativeAccountReminders(
  uid: string,
  clearSaved = true,
) {
  const all = await reminderDevice.scheduled();
  for (const item of all)
    if (item.uid === uid) await reminderDevice.cancel(item.id);
  if (clearSaved) await reminderStore(uid).clear();
}
