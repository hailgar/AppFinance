import { useEffect, useState, type ReactNode } from "react";
import { Modal } from "react-native";
import { router } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { Button, Card, Label, Screen, Title } from "../components/ui";

export function Introduction({
  uid,
  children,
}: {
  uid: string;
  children: ReactNode;
}) {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const key =
    "intro." +
    Array.from(uid)
      .map((c) => c.charCodeAt(0).toString(16))
      .join("-");
  useEffect(() => {
    let mounted = true;
    void SecureStore.getItemAsync(key).then(
      (value) => {
        if (mounted) setVisible(value !== "done");
      },
      () => {
        if (mounted) setVisible(true);
      },
    );
    return () => {
      mounted = false;
    };
  }, [key]);
  async function continueTo(destination?: "/budget" | "/(tabs)/settings") {
    if (busy) return;
    setBusy(true);
    try {
      await SecureStore.setItemAsync(key, "done");
    } catch {
      // An optional introduction must not block use when storage is unavailable.
    } finally {
      setVisible(false);
      if (destination) router.push(destination);
      setBusy(false);
    }
  }
  return (
    <>
      {children}
      <Modal
        visible={visible}
        animationType="slide"
        onRequestClose={() => void continueTo()}
      >
        <Screen>
          <Title>Selamat datang di Catat Harian</Title>
          <Label muted>
            Atur seperlunya, lalu mulai mencatat. Kedua pengaturan ini boleh
            dilewati.
          </Label>
          <Card>
            <Title>Kenali batas harianmu</Title>
            <Label>
              Budget membantu melihat sisa pengeluaran hari ini. Pemasukan
              dicatat terpisah dan tidak otomatis menambah budget.
            </Label>
            <Button
              title="Atur budget harian"
              disabled={busy}
              onPress={() => void continueTo("/budget")}
            />
          </Card>
          <Card>
            <Title>Pengingat yang kamu pilih</Title>
            <Label>
              Pengingat pagi dan malam baru aktif setelah kamu mengaktifkannya
              dan memberi izin notifikasi Android.
            </Label>
            <Label muted>
              Jam pengingat mengikuti perangkat; pembukuan memakai WIB.
            </Label>
            <Button
              title="Atur pengingat"
              secondary
              disabled={busy}
              onPress={() => void continueTo("/(tabs)/settings")}
            />
          </Card>
          <Button
            title="Nanti saja, mulai mencatat"
            secondary
            disabled={busy}
            onPress={() => void continueTo()}
          />
        </Screen>
      </Modal>
    </>
  );
}
