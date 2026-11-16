import { useEffect, useState } from "react";
import { Alert, Linking, Switch, View } from "react-native";
import { useNetInfo } from "@react-native-community/netinfo";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { errorMessage } from "../../src/services/api";
import {
  useSession,
  currentUserName,
  signOutAndClear,
} from "../../src/session";
import {
  Button,
  Card,
  Field,
  Label,
  Screen,
  ScreenHeading,
  SectionHeading,
  TextButton,
} from "../../src/components/ui";
import { theme as t } from "../../src/theme";
import { useReminders } from "../../src/reminders/provider";
import {
  reminderKinds,
  validTime,
  type ReminderKind,
} from "../../src/reminders/controller";

const names: Record<ReminderKind, string> = {
  budget_reminder: "Cek budget pagi",
  record_reminder: "Catat transaksi malam",
};
export default function Settings() {
  const session = useSession(),
    qc = useQueryClient(),
    network = useNetInfo();
  const { controller, state } = useReminders();
  const storage = useQuery({
    queryKey: [session.uid, "storage-status"],
    queryFn: async () =>
      (
        await session.api<{
          status: "OK" | "PENDING" | "FAILED_RETRY_REQUIRED" | "DISABLED";
          source_rows_processed: number;
          projected_rows_processed: number | null;
        }>("/storage/status")
      ).data,
  });
  const online =
    network.isConnected === true && network.isInternetReachable !== false;
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [editingTime, setEditingTime] = useState<ReminderKind | null>(null);
  const [times, setTimes] = useState({
    budget_reminder: state.preferences.budget_reminder.time,
    record_reminder: state.preferences.record_reminder.time,
  });
  useEffect(() => {
    setTimes({
      budget_reminder: state.preferences.budget_reminder.time,
      record_reminder: state.preferences.record_reminder.time,
    });
  }, [
    state.preferences.budget_reminder.time,
    state.preferences.record_reminder.time,
  ]);
  async function action(work: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      await work();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Pengaturan belum bisa diperbarui. Coba lagi.",
      );
    } finally {
      setBusy(false);
    }
  }
  function change(kind: ReminderKind, enabled: boolean) {
    const time = times[kind];
    if (!validTime(time)) {
      setMessage("Gunakan jam 24 jam, misalnya 08:00.");
      return;
    }
    void action(() => controller.update(kind, enabled, time, online));
  }
  return (
    <Screen>
      <ScreenHeading title="Pengaturan" subtitle="Sesuai kebiasaanmu" />
      <Card>
        <Label>{currentUserName()}</Label>
        <Label muted>Mata uang rupiah · pembukuan WIB</Label>
        <Label muted>Jam mengikuti perangkat; pembukuan memakai WIB.</Label>
      </Card>
      <Card>
        <SectionHeading>Laporan Google Sheets</SectionHeading>
        <Label>
          {storage.isPending
            ? "Memeriksa pembaruan laporan…"
            : storage.isError
              ? errorMessage(storage.error)
              : storage.data.status === "OK" &&
                  storage.data.source_rows_processed ===
                    storage.data.projected_rows_processed
                ? "Laporan sudah mengikuti catatan terakhir."
                : "Pembaruan laporan tertunda; server akan mencoba lagi. Catatan yang sudah dikonfirmasi tetap tersimpan."}
        </Label>
        <Button
          title="Periksa laporan"
          secondary
          disabled={storage.isFetching}
          onPress={() => void storage.refetch()}
        />
      </Card>
      <Card>
        <SectionHeading>Pengingat harian</SectionHeading>
        <Label muted>
          Pengingat tetap dikirim meskipun kamu sudah mencatat transaksi.
        </Label>
        <Label>
          Izin Android:{" "}
          {state.permission.granted
            ? "Diizinkan"
            : state.permission.status === "blocked_channel"
              ? "Kanal pengingat dinonaktifkan"
              : state.permission.status === "denied"
                ? "Ditolak"
                : "Belum diberikan"}
        </Label>
        {!state.permission.granted && (
          <>
            <Label muted>
              Kamu tetap dapat mencatat transaksi. Aktifkan salah satu pengingat
              untuk meminta izin pertama kali; jika izin ditolak, ubah melalui
              pengaturan Android.
            </Label>
            <Button
              title="Buka pengaturan notifikasi Android"
              secondary
              onPress={() => void action(() => Linking.openSettings())}
            />
          </>
        )}
        {!state.ready && <Label>Memuat pengaturan perangkat…</Label>}
        {reminderKinds.map((kind) => (
          <View
            key={kind}
            style={{
              gap: 12,
              paddingVertical: 16,
              borderBottomWidth: 1,
              borderColor: t.color.line,
            }}
          >
            <View
              style={{
                minHeight: 48,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <View style={{ flex: 1 }}>
                <Label>{names[kind]}</Label>
                <TextButton
                  title={state.preferences[kind].time + " · Ubah jam"}
                  icon="time-outline"
                  onPress={() =>
                    setEditingTime((current) =>
                      current === kind ? null : kind,
                    )
                  }
                />
              </View>
              <Switch
                trackColor={{ false: t.color.line, true: t.color.action }}
                accessibilityLabel={names[kind]}
                value={state.preferences[kind].enabled}
                disabled={
                  busy || !state.ready || !!state.pending || !!state.conflict
                }
                onValueChange={(enabled) => change(kind, enabled)}
              />
            </View>
            {editingTime === kind && (
              <>
                <Field
                  label={`Jam ${names[kind].toLowerCase()} (HH:mm)`}
                  value={times[kind]}
                  maxLength={5}
                  autoCapitalize="none"
                  editable={
                    !busy && state.ready && !state.pending && !state.conflict
                  }
                  onChangeText={(value) =>
                    setTimes((current) => ({ ...current, [kind]: value }))
                  }
                />
                <Button
                  title="Simpan jam"
                  secondary
                  disabled={
                    busy || !state.ready || !!state.pending || !!state.conflict
                  }
                  onPress={() => change(kind, state.preferences[kind].enabled)}
                />
              </>
            )}
            <Label muted>
              {state.preferences[kind].enabled
                ? state.active[kind]
                  ? `Jadwal aktif di perangkat · ${state.preferences[kind].time}`
                  : "Diaktifkan pada pengaturan; jadwal perangkat belum aktif. Periksa izin dan coba sinkronkan."
                : "Pengingat nonaktif"}
            </Label>
          </View>
        ))}
        <Label>
          {state.conflict
            ? "Pengaturan server berbeda. Tinjau pilihan sebelum menggantinya."
            : state.pending
              ? "Sedang memeriksa pencadangan. Perubahan selanjutnya menunggu hasil sebelumnya."
              : state.dirty
                ? "Tersimpan di perangkat; belum dicadangkan."
                : state.serverChecked
                  ? "Pengaturan terakhir sudah dicadangkan."
                  : "Status cadangan belum diperiksa. Pengaturan lokal tetap dapat digunakan."}
        </Label>
        {state.conflict && (
          <>
            {reminderKinds.map((kind) => (
              <Label key={kind}>
                Server · {names[kind]}:{" "}
                {state.conflict![kind].enabled ? "aktif" : "nonaktif"}{" "}
                {state.conflict![kind].time}
              </Label>
            ))}
            <Button
              title="Gunakan pengaturan server"
              secondary
              disabled={busy}
              onPress={() =>
                void action(() => controller.resolveConflict("server", online))
              }
            />
            <Button
              title="Cadangkan pengaturan perangkat ini"
              disabled={busy || !online}
              onPress={() =>
                Alert.alert(
                  "Ganti pengaturan server?",
                  "Pengaturan perangkat ini akan menggantikan versi server yang baru ditampilkan.",
                  [
                    { text: "Batal", style: "cancel" },
                    {
                      text: "Gunakan perangkat",
                      onPress: () =>
                        void action(() =>
                          controller.resolveConflict("local", online),
                        ),
                    },
                  ],
                )
              }
            />
          </>
        )}
        <Button
          title={busy ? "Memeriksa…" : "Periksa jadwal dan pencadangan"}
          secondary
          disabled={busy || !state.ready}
          onPress={() => void action(() => controller.refresh(online))}
        />
        <Button
          title="Tes notifikasi"
          secondary
          disabled={busy || !state.ready}
          onPress={() =>
            void action(async () => {
              await controller.test();
              setMessage(
                "Notifikasi tes dijadwalkan dalam beberapa detik. Periksa notifikasi Android.",
              );
            })
          }
        />
        <Label muted>
          Waktu pengiriman mengikuti Android dan dapat tertunda. Force-stop, HP
          mati, dan penghemat baterai dapat menghambat pengingat. Jadwal
          diperiksa lagi saat aplikasi dibuka.
        </Label>
        {!!state.error && <Label>{state.error}</Label>}
        {!!message && <Label>{message}</Label>}
      </Card>
      <Button
        title="Keluar dari akun"
        secondary
        disabled={busy}
        onPress={() =>
          void action(async () => {
            const financialPending = await session.vault.get();
            Alert.alert(
              "Keluar dari akun?",
              financialPending || state.pending
                ? "Ada penyimpanan yang belum pasti. Jika tetap keluar, data pemulihan perangkat dihapus dan pengingat dibatalkan. Setelah masuk kembali, periksa data server sebelum mengulang pencatatan."
                : "Cache keuangan dan pengaturan lokal akan dibersihkan; semua pengingat akun dibatalkan.",
              [
                { text: "Tetap di sini", style: "cancel" },
                {
                  text: "Keluar",
                  style: "destructive",
                  onPress: () =>
                    void action(() => signOutAndClear(session, qc)),
                },
              ],
            );
          })
        }
      />
    </Screen>
  );
}
