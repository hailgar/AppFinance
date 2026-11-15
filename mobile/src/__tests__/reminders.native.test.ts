import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as N from "expo-notifications";
import {
  createReminders,
  listenForReminderTap,
  reminderDestination,
} from "../reminders/native";
import { defaults, type Request } from "../reminders/model";

const mocks = vi.hoisted(() => ({
  stored: new Map<string, string>(),
  scheduled: [] as N.NotificationRequestInput[],
  granted: false,
  status: "undetermined",
  channel: 3,
  request: vi.fn(),
  prepare: vi.fn(),
  cancel: vi.fn(),
  handler: vi.fn(),
  navigate: vi.fn(),
  last: null as N.NotificationResponse | null,
  listener: null as ((response: N.NotificationResponse) => void) | null,
}));
vi.mock("expo-notifications", () => ({
  AndroidImportance: { DEFAULT: 3, NONE: 0 },
  AndroidNotificationVisibility: { PRIVATE: 0 },
  SchedulableTriggerInputTypes: {
    DAILY: "daily",
    TIME_INTERVAL: "timeInterval",
  },
  DEFAULT_ACTION_IDENTIFIER: "default",
  setNotificationHandler: mocks.handler,
  setNotificationChannelAsync: mocks.prepare,
  getNotificationChannelAsync: async () => ({ importance: mocks.channel }),
  getPermissionsAsync: async () => ({
    granted: mocks.granted,
    status: mocks.status,
    canAskAgain: true,
  }),
  requestPermissionsAsync: async () => {
    mocks.request();
    mocks.granted = true;
    mocks.status = "granted";
    return { granted: true, status: "granted" };
  },
  getAllScheduledNotificationsAsync: async () => mocks.scheduled,
  scheduleNotificationAsync: async (request: N.NotificationRequestInput) => {
    const id = `native-${mocks.scheduled.length}`;
    mocks.scheduled.push({ ...request, identifier: id });
    return id;
  },
  cancelScheduledNotificationAsync: async (id: string) => {
    mocks.cancel(id);
    mocks.scheduled = mocks.scheduled.filter((r) => r.identifier !== id);
  },
  getPresentedNotificationsAsync: async () => [],
  dismissNotificationAsync: vi.fn(),
  getLastNotificationResponseAsync: async () => mocks.last,
  clearLastNotificationResponseAsync: async () => {
    mocks.last = null;
  },
  addNotificationResponseReceivedListener: (
    listener: (response: N.NotificationResponse) => void,
  ) => {
    mocks.listener = listener;
    return {
      remove: () => {
        mocks.listener = null;
      },
    };
  },
}));
vi.mock("expo-secure-store", () => ({
  getItemAsync: async (key: string) => mocks.stored.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => {
    mocks.stored.set(key, value);
  },
}));
vi.mock("expo-crypto", () => ({ randomUUID: () => "native-operation-key" }));
vi.mock("expo-constants", () => ({
  default: { expoConfig: { android: { package: "id.catatharian.app" } } },
}));
vi.mock("react-native", () => ({
  Linking: { sendIntent: vi.fn(), openSettings: vi.fn() },
}));

beforeEach(() => {
  mocks.stored.clear();
  mocks.scheduled = [];
  mocks.granted = false;
  mocks.status = "undetermined";
  mocks.channel = 3;
  mocks.last = null;
  mocks.listener = null;
  vi.clearAllMocks();
});
const request: Request = async <T>() => ({
  status: 200,
  data: defaults() as T,
});
describe("Expo notification adapter", () => {
  it("creates the channel before asking permission and uses a daily local-time trigger", async () => {
    const c = createReminders("owner", request);
    await c.start();
    expect(mocks.request).not.toHaveBeenCalled();
    await c.change("budget_reminder", { enabled: true, time: "07:45" });
    expect(mocks.prepare.mock.invocationCallOrder[0]!).toBeLessThan(
      mocks.request.mock.invocationCallOrder[0]!,
    );
    expect(mocks.scheduled).toHaveLength(1);
    expect(mocks.scheduled[0]?.trigger).toEqual({
      type: "daily",
      hour: 7,
      minute: 45,
      channelId: "daily-reminders-v1",
    });
    expect(c.getSnapshot().active.budget_reminder).toBeTruthy();
    expect(mocks.scheduled[0]?.content.body).not.toContain("Rp");
    await c.stop();
  });
  it("does not repeat the permission prompt when Android reports denial with canAskAgain", async () => {
    mocks.status = "denied";
    const c = createReminders("owner", request);
    await c.start();
    await c.change("record_reminder", { enabled: true, time: "20:00" });
    await c.refresh();
    expect(mocks.request).not.toHaveBeenCalled();
    expect(mocks.scheduled).toHaveLength(0);
    expect(c.getSnapshot().permission?.canAskAgain).toBe(false);
  });
  it("detects Android channel blocking even when the app has permission", async () => {
    mocks.granted = true;
    mocks.status = "granted";
    mocks.channel = 0;
    const c = createReminders("owner", request);
    await c.start();
    await c.change("record_reminder", { enabled: true, time: "20:00" });
    expect(c.getSnapshot().permission?.channelEnabled).toBe(false);
    expect(mocks.scheduled).toHaveLength(0);
  });
  it("routes only recognized reminder taps belonging to the signed-in account", () => {
    const data = {
      feature: "catat-harian-reminder-v1",
      owner: "owner",
      kind: "record_reminder",
    };
    expect(reminderDestination(data, "owner")).toBe("/transaction");
    expect(
      reminderDestination({ ...data, kind: "budget_reminder" }, "owner"),
    ).toBe("/");
    expect(reminderDestination(data, "other")).toBeNull();
    expect(reminderDestination({ ...data, kind: "test" }, "owner")).toBeNull();
    expect(
      reminderDestination({ ...data, kind: "/sensitive-path" }, "owner"),
    ).toBeNull();
  });
  it("handles a cold-start response once and removes the listener on unmount", async () => {
    mocks.last = {
      actionIdentifier: "default",
      notification: {
        request: {
          identifier: "cold-response",
          content: {
            data: {
              feature: "catat-harian-reminder-v1",
              owner: "owner",
              kind: "record_reminder",
            },
          },
        },
      },
    } as unknown as N.NotificationResponse;
    const response = mocks.last;
    const remove = listenForReminderTap("owner", mocks.navigate);
    await vi.waitFor(() =>
      expect(mocks.navigate).toHaveBeenCalledWith("/transaction"),
    );
    mocks.listener?.(response);
    expect(mocks.navigate).toHaveBeenCalledTimes(1);
    remove();
    expect(mocks.listener).toBeNull();
  });
});
