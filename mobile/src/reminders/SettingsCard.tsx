import { useState, useSyncExternalStore } from "react";
import { Alert, Switch, View } from "react-native";
import { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { onlineManager } from "@tanstack/react-query";
import { Button, Card, Label, Loading, Title } from "../components/ui";
import { openBatterySettings, openNotificationSettings } from "./native";
import { kinds, type Kind } from "./model";
import type { ReminderController } from "./controller";

const labels = {
  budget_reminder: "Cek budget pagi",
  record_reminder: "Catat transaksi malam",
};
const backupLabels = {
  loading: "Memuat pengaturan…",
  saved: "Pengaturan sudah dicadangkan.",
  local: "Tersimpan di perangkat; belum dicadangkan.",
  uncertain: "Hasil pencadangan belum pasti. Periksa kembali saat terhubung.",
  conflict:
    "Pengaturan di server berbeda. Pilih pengaturan yang ingin dipakai.",
};
export function ReminderSettings({
  controller,
}: {
  controller: ReminderController;
}) {
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
  );
  const [busy, setBusy] = useState(false);
  async function action(job: () => Promise<void>) {
    setBusy(true);
    try {
      await job();
    } catch {
      Alert.alert(
        "Belum bisa membuka pengaturan",
        "Coba kembali melalui pengaturan Android.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function change(
    kind: Kind,
    setting: { enabled: boolean; time: string },
  ) {
    await controller.change(kind, setting);
    if (onlineManager.isOnline()) await controller.sync();
  }
  function pickTime(kind: Kind) {
    const current = state.preferences[kind];
    const [hour, minute] = current.time.split(":").map(Number) as [
      number,
      number,
    ];
    const value = new Date();
    value.setHours(hour, minute, 0, 0);
    DateTimePickerAndroid.open({
      value,
      mode: "time",
      is24Hour: true,
      onChange: (event, date) => {
        if (event.type !== "set" || !date) return;
        const time = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
        void action(() =>
          change(kind, { ...controller.getSnapshot().preferences[kind], time }),
        );
      },
    });
  }
  if (!state.ready)
    return (
      <Card>
        <Title>Pengingat harian</Title>
        {state.error ? (
          <>
            <Label>{state.error}</Label>
            <Button
              title="Coba muat pengingat"
              onPress={() => void action(controller.start)}
            />
          </>
        ) : (
          <Loading />
        )}
      </Card>
    );
  const permissionLabel =
    state.permission === null
      ? "Belum diperiksa"
      : !state.permission.granted
        ? "Belum diizinkan"
        : !state.permission.channelEnabled
          ? "Kanal pengingat dinonaktifkan"
          : "Diizinkan";
  return (
    <>
      <Card>
        <Title>Pengingat harian</Title>
        <Label muted>Jam mengikuti perangkat; pembukuan memakai WIB.</Label>
        <Label>Izin notifikasi: {permissionLabel}</Label>
        {kinds.map((kind) => {
          const setting = state.preferences[kind];
          return (
            <View key={kind} style={{ gap: 8 }}>
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
              >
                <View style={{ flex: 1 }}>
                  <Label>{labels[kind]}</Label>
                </View>
                <Switch
                  accessibilityLabel={labels[kind]}
                  style={{ minWidth: 48, minHeight: 48 }}
                  value={setting.enabled}
                  disabled={busy}
                  onValueChange={(enabled) =>
                    void action(() => change(kind, { ...setting, enabled }))
                  }
                />
              </View>
              <Button
                title={`Ubah jam ${labels[kind].toLowerCase()}: ${setting.time}`}
                secondary
                disabled={busy}
                onPress={() => pickTime(kind)}
              />
              <Label muted>
                {!setting.enabled
                  ? "Nonaktif"
                  : state.active[kind]
                    ? "Jadwal terdaftar di perangkat"
                    : "Aktif di pengaturan; jadwal belum terdaftar"}
              </Label>
            </View>
          );
        })}
        {!!state.error && <Label>{state.error}</Label>}
        <Label muted>{backupLabels[state.backup]}</Label>
        {state.conflict && (
          <>
            {kinds.map((kind) => (
              <Label key={kind}>
                Server — {labels[kind]}:{" "}
                {state.conflict![kind].enabled ? "aktif" : "nonaktif"},{" "}
                {state.conflict![kind].time}
              </Label>
            ))}
            <Button
              title="Gunakan pengaturan perangkat"
              disabled={busy}
              onPress={() =>
                void action(async () => {
                  await controller.resolve(true);
                  await controller.sync(true);
                })
              }
            />
            <Button
              title="Gunakan pengaturan server"
              secondary
              disabled={busy}
              onPress={() => void action(() => controller.resolve(false))}
            />
          </>
        )}
        <Button
          title="Periksa jadwal dan pencadangan"
          secondary
          disabled={busy}
          onPress={() =>
            void action(async () => {
              await controller.refresh();
              await controller.sync(true);
            })
          }
        />
        {state.permission?.canAskAgain && !state.permission.granted && (
          <Button
            title="Izinkan notifikasi"
            disabled={busy}
            onPress={() => void action(controller.requestPermission)}
          />
        )}
        <Button
          title="Buka pengaturan notifikasi"
          secondary
          disabled={busy}
          onPress={() => void action(openNotificationSettings)}
        />
        <Button
          title="Tes notifikasi dalam 5 detik"
          secondary
          disabled={busy}
          onPress={() => void action(controller.test)}
        />
        <Label muted>
          Pengingat tetap muncul walaupun kamu sudah mencatat transaksi hari
          ini. Notifikasi tidak menampilkan nominal keuangan.
        </Label>
      </Card>
      <Card>
        <Title>Pengaturan perangkat</Title>
        <Label>
          Notifikasi bisa terlambat karena pengaturan baterai atau mode Jangan
          Ganggu. Pengiriman tepat menit tidak dijamin.
        </Label>
        <Label muted>
          Jika pengingat tidak muncul, periksa izin notifikasi, kanal Pengingat
          harian, dan pembatasan baterai aplikasi Catat Harian. Nama menu
          berbeda pada setiap merek HP.
        </Label>
        <Button
          title="Buka pengaturan baterai"
          secondary
          disabled={busy}
          onPress={() => void action(openBatterySettings)}
        />
        <Label muted>
          Saat HP mati atau aplikasi dihentikan paksa, pengingat tidak dijamin
          muncul. Buka kembali aplikasi untuk memeriksa jadwal setelah restart
          atau perubahan zona waktu.
        </Label>
      </Card>
    </>
  );
}
