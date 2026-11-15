import { Button, Card, Label } from "./ui";
import type { useFinancialCommand } from "./useFinancialCommand";
export function CommandFeedback({
  mutation,
  offline,
  onReviewed,
  onFinished,
}: {
  mutation: ReturnType<typeof useFinancialCommand>;
  offline: boolean;
  onReviewed: () => void;
  onFinished: () => void;
}) {
  if (mutation.status === "UNKNOWN" || mutation.status === "SAVING")
    return (
      <Card>
        {(mutation.authRequired || mutation.previousPending) && (
          <Label>{mutation.message}</Label>
        )}
        {!mutation.busy && (
          <Button
            title="Buka pengaturan akun"
            secondary
            onPress={mutation.recoverAccount}
          />
        )}
        <Label>
          {mutation.busy
            ? "Memeriksa penyimpanan…"
            : "Hasil penyimpanan belum pasti. Jangan membuat perubahan pengganti."}
        </Label>
        <Button
          title="Periksa dan coba kembali"
          disabled={mutation.busy || offline}
          onPress={() => void mutation.run()}
        />
      </Card>
    );
  if (mutation.resourceUnavailable)
    return (
      <Card>
        <Label>
          Data sudah dihapus atau tidak tersedia. Kembali lalu muat data
          terbaru.
        </Label>
        <Button title="Kembali" onPress={onFinished} />
      </Card>
    );
  if (mutation.status === "CONFLICT")
    return (
      <Card>
        <Label>
          Data berubah. Muat data terbaru dan tinjau sebelum menyimpan kembali.
        </Label>
        <Button
          title="Muat dan tinjau data terbaru"
          disabled={offline}
          onPress={onReviewed}
        />
      </Card>
    );
  if (mutation.status === "APPLIED")
    return (
      <Card>
        <Label>Perubahan tersimpan dan sudah dikonfirmasi server.</Label>
        <Button title="Selesai" onPress={onFinished} />
      </Card>
    );
  return mutation.message ? <Label>{mutation.message}</Label> : null;
}
