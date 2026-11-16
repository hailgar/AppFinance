import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { type Transaction, rupiah } from "../domain";
import { theme as t } from "../theme";
import { Label } from "./ui";
import { categoryIcons } from "./CategoryPicker";
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
  if (items.length === 0)
    return (
      <View style={{ paddingVertical: 28 }}>
        <Label muted>Belum ada transaksi pada rentang ini.</Label>
      </View>
    );
  return (
    <View>
      {items.map((item, index) => {
        const income = item.type === "INCOME";
        return (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            accessibilityLabel={`${labels[item.category_code] || "Transaksi"}, ${income ? "Masuk" : "Keluar"} ${rupiah(item.amount)}, ${item.transaction_date}. Lihat detail`}
            onPress={() =>
              router.push({
                pathname: "/transaction-detail",
                params: { id: item.id },
              })
            }
            style={({ pressed }) => ({
              minHeight: 80,
              paddingVertical: 16,
              flexDirection: "row",
              flexWrap: "wrap",
              alignItems: "center",
              gap: 12,
              borderBottomWidth: index < items.length - 1 ? 1 : 0,
              borderColor: t.color.line,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <View
              style={{
                width: 42,
                height: 42,
                borderRadius: 13,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: income ? t.color.tint : t.color.neutral,
              }}
            >
              <Ionicons
                name={categoryIcons[item.category_code] || "ellipse-outline"}
                size={20}
                color={income ? t.color.action : t.color.muted}
              />
            </View>
            <View style={{ flex: 1, minWidth: 100, gap: 4 }}>
              <Text
                style={{ color: t.color.text, fontSize: 16, fontWeight: "600" }}
              >
                {labels[item.category_code] || "Transaksi"}
              </Text>
              <Label muted small>
                {item.note || item.transaction_date}
              </Label>
            </View>
            <View
              style={{
                flexShrink: 1,
                maxWidth: "52%",
                marginLeft: "auto",
                gap: 4,
              }}
            >
              <Text
                style={{
                  color: income ? t.color.action : t.color.text,
                  fontSize: 15,
                  fontWeight: "600",
                  textAlign: "right",
                  fontVariant: ["tabular-nums"],
                }}
              >
                {income ? "+" : "−"}
                {new Intl.NumberFormat("id-ID").format(item.amount)}
              </Text>
              <Text
                style={{
                  textAlign: "right",
                  color: t.color.muted,
                  fontSize: 13,
                }}
              >
                {income ? "Masuk" : "Keluar"}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
