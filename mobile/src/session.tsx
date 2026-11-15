import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { AppState, Alert } from "react-native";
import { useRouter } from "expo-router";
import {
  createReminders,
  clearOrphanReminders,
  listenForReminderTap,
} from "./reminders/native";
import NetInfo from "@react-native-community/netinfo";
import {
  QueryClient,
  QueryClientProvider,
  onlineManager,
  useQueryClient,
} from "@tanstack/react-query";
import {
  auth,
  login,
  logout,
  observeSession,
  tokenSource,
} from "./services/auth";
import { createApi, errorMessage } from "./services/api";
import { CommandRunner } from "./services/commands";
import { vaultFor } from "./services/vault";
import { Button, Card, Label, Loading, Screen, Title } from "./components/ui";
onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((s) =>
    setOnline(s.isConnected !== false && s.isInternetReachable !== false),
  ),
);
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
});
const Context = createContext<ReturnType<typeof createSession> | null>(null);
function createSession(uid: string) {
  const api = createApi(
    process.env.EXPO_PUBLIC_API_BASE_URL || "",
    tokenSource,
  );
  const vault = vaultFor(uid);
  return {
    uid,
    api,
    vault,
    reminders: createReminders(uid, api),
    commands: new CommandRunner(vault, api),
  };
}
export const useSession = () => {
  const s = useContext(Context);
  if (!s) throw Error("Session required");
  return s;
};
function Gate({ children }: { children: ReactNode }) {
  const [uid, setUid] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [ready, setReady] = useState(false),
    [pending, setPending] = useState(false);
  const qc = useQueryClient();
  const router = useRouter();
  useEffect(
    () =>
      observeSession((user) => {
        qc.clear();
        setReady(false);
        setPending(false);
        setUid(user?.uid || null);
      }),
    [qc],
  );
  const session = useMemo(
    () =>
      uid && process.env.EXPO_PUBLIC_API_BASE_URL ? createSession(uid) : null,
    [uid],
  );
  useEffect(() => {
    if (!session) {
      if (uid === null) void clearOrphanReminders().catch(() => undefined);
      return;
    }
    const reminders = session.reminders;
    let active = true;
    const refresh = async () => {
      await reminders.refresh();
      if (active && onlineManager.isOnline()) await reminders.sync();
    };
    void reminders.start().then(() => {
      if (active) void refresh();
    });
    const app = AppState.addEventListener("change", (state) => {
      if (state === "active") void refresh();
    });
    const network = NetInfo.addEventListener((state) => {
      if (state.isConnected && state.isInternetReachable !== false)
        void refresh();
    });
    return () => {
      active = false;
      app.remove();
      network();
      void reminders.stop().catch(() => undefined);
    };
  }, [session, uid]);
  useEffect(() => {
    if (!session || !ready || pending) return;
    return listenForReminderTap(session.uid, (route) => router.push(route));
  }, [session, ready, pending, router]);
  useEffect(() => {
    let active = true;
    if (session)
      session.vault
        .get()
        .then((c) => {
          if (active) {
            setPending(!!c);
            setReady(true);
          }
        })
        .catch(() => {
          if (active)
            setError(
              "Penyimpanan pemulihan belum bisa dibaca. Tutup lalu buka kembali aplikasi.",
            );
        });
    return () => {
      active = false;
    };
  }, [session]);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") void qc.invalidateQueries();
    });
    return () => sub.remove();
  }, [qc]);
  async function signIn() {
    setBusy(true);
    setError("");
    try {
      await login();
    } catch {
      setError(
        "Belum bisa masuk. Periksa koneksi dan konfigurasi akun Google.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (uid === undefined)
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  if (
    !process.env.EXPO_PUBLIC_API_BASE_URL ||
    !process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID
  )
    return (
      <Screen>
        <Title>Catat Harian</Title>
        <Card>
          <Label>
            Konfigurasi koneksi aplikasi belum tersedia. Hubungi pengelola
            aplikasi.
          </Label>
        </Card>
      </Screen>
    );
  if (!uid)
    return (
      <Screen>
        <Title>Catat Harian</Title>
        <Label muted>Kenali batas pengeluaran, catat dengan tenang.</Label>
        <Card>
          <Title>Mulai dari hari ini</Title>
          <Label>
            Masuk dengan akun Google untuk mengakses catatan pribadi kamu.
          </Label>
          <Button
            title={busy ? "Sedang masuk…" : "Masuk dengan Google"}
            disabled={busy}
            onPress={() => void signIn()}
          />
          {!!error && <Label>{error}</Label>}
        </Card>
        <Label muted>
          Pembukuan menggunakan WIB. Data keuangan memerlukan koneksi internet.
        </Label>
      </Screen>
    );
  if (!session || !ready)
    return <Screen>{error ? <Label>{error}</Label> : <Loading />}</Screen>;
  if (pending)
    return (
      <Screen>
        <Title>Periksa catatan terakhir</Title>
        <Label>
          Sedang memeriksa penyimpanan. Selesaikan pemeriksaan sebelum membuat
          catatan pengganti.
        </Label>
        <Button
          title={busy ? "Memeriksa…" : "Periksa dan coba kembali"}
          disabled={busy}
          onPress={() =>
            void (async () => {
              setBusy(true);
              try {
                const status = await session.commands.run();
                if (status !== "UNKNOWN") {
                  await qc.invalidateQueries();
                  setPending(false);
                  if (status === "CONFLICT")
                    Alert.alert(
                      "Tinjau data terbaru",
                      "Catatan sebelumnya mengalami konflik. Periksa riwayat sebelum mencatat kembali.",
                    );
                }
              } catch (e) {
                setError(errorMessage(e));
              } finally {
                setBusy(false);
              }
            })()
          }
        />
        {!!error && <Label>{error}</Label>}
        <Button
          title="Tetap keluar dari akun"
          secondary
          disabled={busy}
          onPress={() =>
            Alert.alert(
              "Keluar saat penyimpanan belum pasti?",
              "Data pemulihan di perangkat akan dihapus. Setelah login kembali, periksa riwayat server sebelum membuat catatan pengganti.",
              [
                { text: "Tunggu", style: "cancel" },
                {
                  text: "Keluar",
                  style: "destructive",
                  onPress: () =>
                    void (async () => {
                      try {
                        await signOutAndClear(session, qc);
                      } catch {
                        setError("Belum bisa keluar. Coba lagi.");
                      }
                    })(),
                },
              ],
            )
          }
        />
      </Screen>
    );
  return <Context.Provider value={session}>{children}</Context.Provider>;
}
export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <Gate>{children}</Gate>
    </QueryClientProvider>
  );
}
export async function signOutAndClear(
  session: ReturnType<typeof useSession>,
  qc: QueryClient,
) {
  try {
    await session.reminders.stop();
    await session.vault.clear();
    qc.clear();
    await logout();
  } catch (error) {
    // If logout failed, the signed-in account still owns its local preferences.
    if (auth.currentUser?.uid === session.uid) await session.reminders.start();
    throw error;
  }
}
export const currentUserName = () => auth.currentUser?.displayName || "Kamu";
