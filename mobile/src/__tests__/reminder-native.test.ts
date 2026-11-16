import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as Notifications from "expo-notifications";
import {
  clearNativeAccountReminders,
  clearOrphanNativeReminders,
  reminderDevice,
} from "../reminders/native";

const mocks = vi.hoisted(() => ({
  scheduled: [] as Notifications.NotificationRequest[],
  presented: [] as Notifications.Notification[],
  last: null as Notifications.NotificationResponse | null,
  granted: true,
  importance: 3,
  prepare: vi.fn(),
  request: vi.fn(),
  cancel: vi.fn(),
  dismiss: vi.fn(),
  clearResponse: vi.fn(),
  clearStore: vi.fn(),
  handler: vi.fn(),
  schedule: vi.fn(),
}));

vi.mock("expo-notifications", () => ({
  AndroidImportance: { DEFAULT: 3, NONE: 0 },
  AndroidNotificationVisibility: { PRIVATE: 0 },
  SchedulableTriggerInputTypes: {
    DAILY: "daily",
    TIME_INTERVAL: "timeInterval",
  },
  setNotificationHandler: mocks.handler,
  setNotificationChannelAsync: mocks.prepare,
  getNotificationChannelAsync: async () => ({ importance: mocks.importance }),
  getPermissionsAsync: async () => ({
    granted: mocks.granted,
    status: mocks.granted ? "granted" : "denied",
    canAskAgain: false,
  }),
  requestPermissionsAsync: async () => {
    mocks.request();
  },
  getAllScheduledNotificationsAsync: async () => mocks.scheduled,
  getPresentedNotificationsAsync: async () => mocks.presented,
  getLastNotificationResponseAsync: async () => mocks.last,
  cancelScheduledNotificationAsync: async (id: string) => {
    mocks.cancel(id);
    mocks.scheduled = mocks.scheduled.filter((item) => item.identifier !== id);
  },
  dismissNotificationAsync: async (id: string) => {
    mocks.dismiss(id);
    mocks.presented = mocks.presented.filter(
      (item) => item.request.identifier !== id,
    );
  },
  clearLastNotificationResponseAsync: async () => {
    mocks.clearResponse();
    mocks.last = null;
  },
  scheduleNotificationAsync: async (
    request: Notifications.NotificationRequestInput,
  ) => {
    mocks.schedule(request);
    const identifier = "new-test";
    mocks.scheduled.push({
      ...request,
      identifier,
    } as Notifications.NotificationRequest);
    return identifier;
  },
}));
vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(async () => undefined),
  deleteItemAsync: mocks.clearStore,
}));
vi.mock("react-native", () => ({ Platform: { OS: "android" } }));

const marker = "catat-harian-local-v1";
function request(
  id: string,
  uid = "owner",
  tagged = true,
  kind = "budget_reminder",
) {
  return {
    identifier: id,
    content: {
      title: "Catat Harian",
      data: {
        owner: tagged ? marker : "another-feature",
        uid,
        kind,
        zone: "Asia/Jakarta",
      },
    },
    trigger: { type: "daily", hour: 8, minute: 0 },
  } as unknown as Notifications.NotificationRequest;
}
function notification(id: string, uid = "owner", tagged = true) {
  return { request: request(id, uid, tagged) } as Notifications.Notification;
}
function response(id: string, uid = "owner", tagged = true) {
  return {
    notification: notification(id, uid, tagged),
    actionIdentifier: "default",
  } as Notifications.NotificationResponse;
}
beforeEach(() => {
  mocks.scheduled = [];
  mocks.presented = [];
  mocks.last = null;
  mocks.granted = true;
  mocks.importance = 3;
  vi.clearAllMocks();
});

describe("native reminder ownership and cleanup", () => {
  it("creates the channel before requesting permission and sends a local daily trigger", async () => {
    await reminderDevice.prepare();
    expect(mocks.request).not.toHaveBeenCalled();
    await reminderDevice.requestPermission();
    await reminderDevice.schedule(
      "owner",
      "budget_reminder",
      "07:45",
      "Asia/Jakarta",
    );
    expect(mocks.prepare.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.request.mock.invocationCallOrder[0]!,
    );
    expect(mocks.schedule.mock.calls[0]?.[0].trigger).toEqual({
      type: "daily",
      hour: 7,
      minute: 45,
      channelId: "daily-reminders",
    });
    expect(mocks.schedule.mock.calls[0]?.[0].content.body).not.toContain("Rp");
  });

  it("reports a blocked Android channel even when app permission is granted", async () => {
    mocks.importance = 0;
    expect(await reminderDevice.permission()).toMatchObject({
      granted: false,
      status: "blocked_channel",
    });
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it("deduplicates test notifications only for the requesting account and feature", async () => {
    mocks.scheduled = [
      request("prior-test", "owner", true, "test"),
      request("daily"),
      request("other-account-test", "other", true, "test"),
      request("other-feature-test", "owner", false, "test"),
    ];
    await reminderDevice.test("owner");
    expect(mocks.cancel.mock.calls).toEqual([["prior-test"]]);
    expect(mocks.scheduled.map((item) => item.identifier)).toEqual([
      "daily",
      "other-account-test",
      "other-feature-test",
      "new-test",
    ]);
  });

  it("cleans scheduled and displayed reminders plus last response for one account", async () => {
    mocks.scheduled = [
      request("own"),
      request("other-account", "other"),
      request("other-feature", "owner", false),
    ];
    mocks.presented = [
      notification("own-shown"),
      notification("other-shown", "other"),
      notification("feature-shown", "owner", false),
    ];
    mocks.last = response("own-last");
    await clearNativeAccountReminders("owner");
    expect(mocks.cancel.mock.calls).toEqual([["own"]]);
    expect(mocks.dismiss.mock.calls).toEqual([["own-shown"]]);
    expect(mocks.clearResponse).toHaveBeenCalledTimes(1);
    expect(mocks.clearStore).toHaveBeenCalledTimes(1);
    expect(mocks.scheduled.map((item) => item.identifier)).toEqual([
      "other-account",
      "other-feature",
    ]);
    expect(mocks.presented.map((item) => item.request.identifier)).toEqual([
      "other-shown",
      "feature-shown",
    ]);
  });

  it("preserves saved settings during pre-signout cleanup and clears only after success", async () => {
    mocks.scheduled = [request("own")];
    mocks.presented = [notification("own-shown")];
    await clearNativeAccountReminders("owner", false);
    expect(mocks.cancel).toHaveBeenCalledWith("own");
    expect(mocks.dismiss).toHaveBeenCalledWith("own-shown");
    expect(mocks.clearStore).not.toHaveBeenCalled();
    await clearNativeAccountReminders("owner", true);
    expect(mocks.clearStore).toHaveBeenCalledTimes(1);
  });

  it("clears signed-out orphans for all tagged accounts without deleting preferences", async () => {
    mocks.scheduled = [
      request("a"),
      request("b", "other"),
      request("unrelated", "owner", false),
    ];
    mocks.presented = [
      notification("shown-a"),
      notification("shown-b", "other"),
      notification("shown-unrelated", "owner", false),
    ];
    mocks.last = response("last-other", "other");
    await clearOrphanNativeReminders();
    expect(mocks.cancel.mock.calls).toEqual([["a"], ["b"]]);
    expect(mocks.dismiss.mock.calls).toEqual([["shown-a"], ["shown-b"]]);
    expect(mocks.clearResponse).toHaveBeenCalledTimes(1);
    expect(mocks.clearStore).not.toHaveBeenCalled();
    expect(mocks.scheduled.map((item) => item.identifier)).toEqual([
      "unrelated",
    ]);
  });

  it("does not clear another account's last response during account cleanup", async () => {
    mocks.last = response("last-other", "other");
    await clearNativeAccountReminders("owner", false);
    expect(mocks.clearResponse).not.toHaveBeenCalled();
    expect(mocks.last?.notification.request.identifier).toBe("last-other");
    mocks.last = response("unrelated", "owner", false);
    await clearOrphanNativeReminders();
    expect(mocks.clearResponse).not.toHaveBeenCalled();
  });

  it("propagates native cleanup failure instead of discarding saved recovery state", async () => {
    mocks.scheduled = [request("own")];
    mocks.cancel.mockImplementationOnce(() => {
      throw Error("native cancellation failed");
    });
    await expect(clearNativeAccountReminders("owner")).rejects.toThrow(
      "native cancellation failed",
    );
    expect(mocks.clearStore).not.toHaveBeenCalled();
  });
});
