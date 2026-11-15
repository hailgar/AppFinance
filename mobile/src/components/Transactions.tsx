import { View } from "react-native";
import { type Transaction, rupiah } from "../domain";
import { Card, Label } from "./ui";
const labels: Record<string, string> = {
  EXP_FOOD: "Makan & Minum",
  EXP_TRANSPORT: "Transportasi",
  EXP_SHOPPING: "Belanja",
  EXP_BILLS: "Tagihan",
  EXP_ENTERTAINMENT: "Hiburan",
  EXP_OTHER: "Lainnya",
  INC_SALARY: "Gaji",
  INC_BONUS: "Bonus",
  INC_OTHER: "Lainnya",
};
export function Transactions({ items }: { items: Transaction[] }) {
  return (
    <Card>
      {items.length === 0 ? (
        <Label muted>Belum ada transaksi pada rentang ini.</Label>
      ) : (
        items.map((item) => (
          <View key={item.id} style={{ gap: 4, paddingVertical: 8 }}>
            <Label>{labels[item.category_code] || "Transaksi"}</Label>
            <Label>
              {item.type === "EXPENSE" ? "Keluar" : "Masuk"} ·{" "}
              {rupiah(item.amount)}
            </Label>
            <Label muted>
              {item.transaction_date}
              {item.note ? ` · ${item.note}` : ""}
            </Label>
          </View>
        ))
      )}
    </Card>
  );
}
