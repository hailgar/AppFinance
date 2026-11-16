import { Button, Card, Label } from "../../src/components/ui";
export function CommandFeedback({ mutation, onFinished }) {
  if (mutation.status === "APPLIED")
    return (
      <Card>
        <Label>
          Perubahan contoh diterapkan hanya di pratinjau ini. Tidak ada data
          dikirim ke backend atau Google Sheets.
        </Label>
        <Button title="Selesai" onPress={onFinished} />
      </Card>
    );
  return mutation.message ? <Label>{mutation.message}</Label> : null;
}
