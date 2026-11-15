import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { AppState } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { randomUUID } from "expo-crypto";
import {
  ReminderController,
  type ReminderRequest,
  type ReminderState,
} from "./controller";
import {
  clearNativeAccountReminders,
  reminderDevice,
  reminderStore,
} from "./native";

const controllers = new Map<string, ReminderController>();
const Context = createContext<{
  controller: ReminderController;
  state: ReminderState;
} | null>(null);
export function ReminderProvider({
  uid,
  api,
  children,
}: {
  uid: string;
  api: ReminderRequest;
  children: ReactNode;
}) {
  const controller = useMemo(
    () =>
      new ReminderController(
        uid,
        reminderStore(uid),
        reminderDevice,
        api,
        randomUUID,
        () => Intl.DateTimeFormat().resolvedOptions().timeZone || "local",
      ),
    [uid, api],
  );
  const [state, setState] = useState(controller.snapshot());
  useEffect(() => {
    controllers.set(uid, controller);
    let mounted = true;
    let online = false;
    let started = false;
    let startupOnline = false;
    let refreshing = false;
    const refresh = async () => {
      if (!started || refreshing || !mounted) return;
      refreshing = true;
      try {
        await controller.refresh(online);
      } catch {
        if (mounted)
          setState((current) => ({
            ...current,
            error: "Jadwal pengingat belum bisa diperiksa. Coba lagi.",
          }));
      } finally {
        refreshing = false;
      }
    };
    const unsubscribe = controller.subscribe((next) => {
      if (mounted) setState(next);
    });
    const network = NetInfo.addEventListener((status) => {
      const next =
        status.isConnected === true && status.isInternetReachable !== false;
      const reconnected = next && !online;
      online = next;
      if (reconnected) void refresh();
    });
    const resume = AppState.addEventListener("change", (next) => {
      if (next === "active") void refresh();
    });
    void NetInfo.fetch()
      .then((status) => {
        if (!mounted) return;
        online =
          status.isConnected === true && status.isInternetReachable !== false;
        startupOnline = online;
        return controller.start(online);
      })
      .then(() => {
        if (!mounted) return;
        started = true;
        // A reconnect while start() was queued must not lose its backup attempt.
        if (online !== startupOnline) void refresh();
      })
      .catch(() => {
        if (mounted)
          setState((current) => ({
            ...current,
            error:
              "Pengaturan pengingat belum bisa dibaca. Coba tutup lalu buka kembali aplikasi.",
          }));
      });
    return () => {
      mounted = false;
      unsubscribe();
      network();
      resume.remove();
      // Stop is queued behind any request; it synchronously blocks new scheduling.
      void controller.stop(false).catch(() => undefined);
      if (controllers.get(uid) === controller) controllers.delete(uid);
    };
  }, [controller, uid]);
  return (
    <Context.Provider value={{ controller, state }}>
      {children}
    </Context.Provider>
  );
}
export function useReminders() {
  const context = useContext(Context);
  if (!context)
    throw Error("ReminderProvider is required for authenticated settings.");
  return context;
}
export async function stopAccountReminders(uid: string, clearSaved = true) {
  const controller = controllers.get(uid);
  if (controller) await controller.stop(clearSaved);
  else await clearNativeAccountReminders(uid, clearSaved);
}
export async function resumeAccountReminders(uid: string) {
  const controller = controllers.get(uid);
  if (!controller) return;
  const status = await NetInfo.fetch();
  await controller.resume(
    status.isConnected === true && status.isInternetReachable !== false,
  );
}
