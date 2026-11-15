import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import Constants from "expo-constants";
import { Linking } from "react-native";
import {
  copy,
  storedSchema,
  type Device,
  type Kind,
  type Storage,
  type Request,
} from "./model";
import { ReminderController, withDeviceLock } from "./controller";

const FEATURE = "catat-harian-reminder-v1";
const CHANNEL = "daily-reminders-v1";
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});
function storageFor(uid: string): Storage {
  const key =
    "reminder." +
    Array.from(uid)
      .map((c) => c.charCodeAt(0).toString(16))
      .join("-");
  return {
    load: async () => {
      const raw = await SecureStore.getItemAsync(key);
      return raw ? storedSchema.parse(JSON.parse(raw)) : null;
    },
    save: (value) => SecureStore.setItemAsync(key, JSON.stringify(value)),
  };
}
const device: Device = {
  prepare: async () => {
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: "Pengingat harian",
      importance: Notifications.AndroidImportance.DEFAULT,
      description: "Cek budget dan catat transaksi harian",
      sound: "default",
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
    });
  },
  permission: async (request) => {
    const p = request
      ? await Notifications.requestPermissionsAsync()
      : await Notifications.getPermissionsAsync();
    const channel = await Notifications.getNotificationChannelAsync(CHANNEL);
    return {
      granted: p.granted,
      // After rejection, guide to settings instead of repeating permission dialogs.
      canAskAgain: p.status === "undetermined" && p.canAskAgain,
      channelEnabled:
        !!channel &&
        channel.importance !== Notifications.AndroidImportance.NONE,
    };
  },
  list: async () =>
    (await Notifications.getAllScheduledNotificationsAsync())
      .filter((n) => n.content.data?.feature === FEATURE)
      .map((n) => {
        const data = n.content.data ?? {};
        const trigger = n.trigger;
        const time = typeof data.time === "string" ? data.time : undefined;
        const parts = time?.split(":").map(Number);
        return {
          id: n.identifier,
          owner: typeof data.owner === "string" ? data.owner : undefined,
          kind: typeof data.kind === "string" ? data.kind : undefined,
          time,
          zone: typeof data.zone === "string" ? data.zone : undefined,
          validDaily:
            !!trigger &&
            "type" in trigger &&
            trigger.type === "daily" &&
            "hour" in trigger &&
            "minute" in trigger &&
            trigger.hour === parts?.[0] &&
            trigger.minute === parts?.[1],
        };
      }),
  schedule: (uid, kind, time, zone) => {
    const [hour, minute] = time.split(":").map(Number) as [number, number];
    return Notifications.scheduleNotificationAsync({
      content: {
        title: copy[kind].title,
        body: copy[kind].body,
        sound: "default",
        data: { feature: FEATURE, owner: uid, kind, time, zone },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute,
        channelId: CHANNEL,
      },
    });
  },
  cancel: Notifications.cancelScheduledNotificationAsync,
  dismiss: async (uid) => {
    for (const notification of await Notifications.getPresentedNotificationsAsync()) {
      if (
        notification.request.content.data?.feature === FEATURE &&
        notification.request.content.data.owner === uid
      )
        await Notifications.dismissNotificationAsync(
          notification.request.identifier,
        );
    }
    const last = await Notifications.getLastNotificationResponseAsync();
    if (
      last?.notification.request.content.data?.feature === FEATURE &&
      last.notification.request.content.data.owner === uid
    )
      await Notifications.clearLastNotificationResponseAsync();
  },
  test: async (uid) => {
    for (const notification of await device.list())
      if (notification.owner === uid && notification.kind === "test")
        await device.cancel(notification.id);
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Tes pengingat",
        body: "Notifikasi Catat Harian berhasil diterima di perangkat ini.",
        sound: "default",
        data: { feature: FEATURE, owner: uid, kind: "test" },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: 5,
        repeats: false,
        channelId: CHANNEL,
      },
    });
  },
  zone: () => Intl.DateTimeFormat().resolvedOptions().timeZone,
};
export const createReminders = (uid: string, request: Request) =>
  new ReminderController(
    uid,
    storageFor(uid),
    device,
    request,
    Crypto.randomUUID,
  );

export const clearOrphanReminders = () =>
  withDeviceLock(async () => {
    const owners = new Set<string>();
    for (const item of await device.list()) {
      await device.cancel(item.id);
      if (item.owner) owners.add(item.owner);
    }
    for (const owner of owners) await device.dismiss(owner);
  });
export async function openNotificationSettings() {
  const appId = Constants.expoConfig?.android?.package;
  if (!appId) {
    await Linking.openSettings();
    return;
  }
  try {
    await Linking.sendIntent("android.settings.APP_NOTIFICATION_SETTINGS", [
      { key: "android.provider.extra.APP_PACKAGE", value: appId },
    ]);
  } catch {
    await Linking.openSettings();
  }
}
export const openBatterySettings = async () => {
  try {
    await Linking.sendIntent(
      "android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS",
    );
  } catch {
    await Linking.openSettings();
  }
};
export function reminderDestination(
  data: Record<string, unknown>,
  uid: string,
): "/" | "/transaction" | null {
  if (data.feature !== FEATURE || data.owner !== uid) return null;
  if (data.kind === "budget_reminder") return "/";
  if (data.kind === "record_reminder") return "/transaction";
  return null;
}
export function listenForReminderTap(
  uid: string,
  navigate: (route: "/" | "/transaction") => void,
) {
  let active = true;
  let lastId = "";
  const respond = (response: Notifications.NotificationResponse | null) => {
    if (
      !active ||
      !response ||
      response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER
    )
      return;
    const id = response.notification.request.identifier;
    if (id === lastId) return;
    lastId = id;
    const destination = reminderDestination(
      response.notification.request.content.data ?? {},
      uid,
    );
    if (destination) navigate(destination);
    void Notifications.clearLastNotificationResponseAsync().catch(
      () => undefined,
    );
  };
  const sub = Notifications.addNotificationResponseReceivedListener(respond);
  void Notifications.getLastNotificationResponseAsync()
    .then(respond)
    .catch(() => undefined);
  return () => {
    active = false;
    sub.remove();
  };
}
export type { Kind };
