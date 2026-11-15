import { Alert } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import {
  useSession,
  currentUserName,
  signOutAndClear,
} from "../../src/session";
import { Button, Card, Label, Screen, Title } from "../../src/components/ui";
export default function Settings() {
  const s = useSession(),
    qc = useQueryClient();
  return (
    <Screen>
      <Title>Pengaturan</Title>
      <Card>
        <Label>{currentUserName()}</Label>
        <Label muted>Mata uang rupiah · pembukuan WIB</Label>
        <Label muted>Jam pengingat mengikuti jam lokal perangkat.</Label>
      </Card>
      <Button
        title="Keluar dari akun"
        secondary
        onPress={() =>
          void (async () => {
            const pending = await s.vault.get();
            Alert.alert(
              "Keluar dari akun?",
              pending
                ? "Ada catatan yang belum pasti tersimpan. Jika tetap keluar, data pemulihan di perangkat dihapus. Setelah masuk kembali, periksa riwayat server sebelum mencatat ulang."
                : "Cache keuangan di perangkat akan dibersihkan.",
              [
                { text: "Tetap di sini", style: "cancel" },
                {
                  text: "Keluar",
                  style: "destructive",
                  onPress: () =>
                    void signOutAndClear(s, qc).catch(() =>
                      Alert.alert("Belum bisa keluar", "Coba lagi."),
                    ),
                },
              ],
            );
          })()
        }
      />
    </Screen>
  );
}
