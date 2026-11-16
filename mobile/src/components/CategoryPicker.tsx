import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, Text, View } from "react-native";
import type { Category } from "../domain";
import { theme as t } from "../theme";
import type { IconName } from "./ui";
export const categoryIcons: Record<string, IconName> = {
  EXP_FOOD: "restaurant-outline",
  EXP_TRANSPORT: "bus-outline",
  EXP_SHOPPING: "bag-handle-outline",
  EXP_BILLS: "receipt-outline",
  EXP_ENTERTAINMENT: "game-controller-outline",
  EXP_OTHER: "ellipsis-horizontal",
  INC_SALARY: "briefcase-outline",
  INC_BONUS: "gift-outline",
  INC_OTHER: "cash-outline",
};
export function CategoryPicker({
  items,
  value,
  onChange,
  includeType = false,
}: {
  items: Category[];
  value: string;
  onChange: (value: string) => void;
  includeType?: boolean;
}) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {items.map((item) => (
        <Pressable
          key={item.code}
          accessibilityRole="button"
          accessibilityState={{ selected: value === item.code }}
          onPress={() => onChange(item.code)}
          style={{
            flexGrow: 1,
            flexBasis: "30%",
            minWidth: 90,
            padding: 10,
            minHeight: 88,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: value === item.code ? t.color.action : t.color.line,
            backgroundColor:
              value === item.code ? t.color.tint : t.color.surface,
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
        >
          <Ionicons
            name={categoryIcons[item.code] || "ellipse-outline"}
            size={21}
            color={value === item.code ? t.color.action : t.color.muted}
          />
          <Text
            style={{
              textAlign: "center",
              fontSize: 14,
              color: value === item.code ? t.color.action : t.color.muted,
              fontWeight: value === item.code ? "600" : "400",
            }}
          >
            {item.label}
            {includeType
              ? item.type === "EXPENSE"
                ? " · Keluar"
                : " · Masuk"
              : ""}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
