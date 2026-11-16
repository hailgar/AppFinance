import { Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { budgetState, rupiah } from "../domain";
import { theme as t } from "../theme";
import { Card, Eyebrow, TextButton, Label, type IconName } from "./ui";
export function BudgetCard({
  budget,
  expense,
  income,
  onEdit,
}: {
  budget: number | null;
  expense: number;
  income?: number;
  onEdit?: () => void;
}) {
  const state = budgetState(budget, expense);
  return (
    <Card>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <View style={{ flex: 1, minWidth: 120 }}>
          <Eyebrow>
            {state.amount === null ? "Budget harian" : state.label}
          </Eyebrow>
        </View>
        {onEdit && (
          <TextButton title="Atur" icon="pencil-outline" onPress={onEdit} />
        )}
      </View>
      {state.amount === null ? (
        <Text style={{ fontSize: 24, color: t.color.text, fontWeight: "600" }}>
          Budget belum diatur
        </Text>
      ) : (
        <Text
          style={{
            fontSize: state.amount >= 1_000_000_000 ? 28 : 44,
            letterSpacing: -1,
            fontWeight: "700",
            color: state.over ? t.color.danger : t.color.text,
            fontVariant: ["tabular-nums"],
          }}
        >
          <Text
            style={{
              fontSize: state.amount >= 1_000_000_000 ? 22 : 25,
              fontWeight: "400",
            }}
          >
            Rp
          </Text>
          {new Intl.NumberFormat("id-ID").format(state.amount)}
        </Text>
      )}
      {state.progress !== null && (
        <View
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel="Pemakaian budget"
          accessibilityValue={{ min: 0, max: 100, now: state.progress }}
          style={{
            height: 6,
            borderRadius: 4,
            backgroundColor: t.color.neutral,
            overflow: "hidden",
          }}
        >
          <View
            style={{
              height: 6,
              width: `${state.progress}%`,
              backgroundColor: state.over ? t.color.danger : t.color.action,
            }}
          />
        </View>
      )}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <Label muted small>
          {budget === null
            ? "Atur batas pengeluaran harianmu."
            : `Budget ${rupiah(budget)}`}
        </Label>
        {state.progress !== null && (
          <Label muted small>
            {Math.round((expense / budget!) * 100)}% terpakai
          </Label>
        )}
      </View>
      {income !== undefined && (
        <View
          style={{
            borderTopWidth: 1,
            borderColor: t.color.line,
            paddingTop: 20,
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 16,
          }}
        >
          <MoneyStat
            label="Pengeluaran"
            amount={expense}
            icon="arrow-up-outline"
          />
          <MoneyStat
            label="Pemasukan"
            amount={income}
            icon="arrow-down-outline"
          />
        </View>
      )}
    </Card>
  );
}
function MoneyStat({
  label,
  amount,
  icon,
}: {
  label: string;
  amount: number;
  icon: IconName;
}) {
  return (
    <View style={{ flexGrow: 1, flexBasis: "42%", minWidth: 100, gap: 6 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        <Ionicons name={icon} size={15} color={t.color.muted} />
        <Label muted small>
          {label}
        </Label>
      </View>
      <Text
        style={{
          color: t.color.text,
          fontSize: 18,
          fontWeight: "600",
          fontVariant: ["tabular-nums"],
        }}
      >
        {rupiah(amount)}
      </Text>
    </View>
  );
}
