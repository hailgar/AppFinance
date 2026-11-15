import { Text, View } from "react-native";
import { budgetState, rupiah } from "../domain";
import { theme as t } from "../theme";
import { Card, Label } from "./ui";
export function BudgetCard({
  budget,
  expense,
}: {
  budget: number | null;
  expense: number;
}) {
  const state = budgetState(budget, expense);
  return (
    <Card>
      <Label>{state.label}</Label>
      {state.amount !== null && (
        <Text
          style={{
            fontSize: 32,
            fontWeight: "700",
            color: state.over ? t.color.danger : t.color.text,
          }}
        >
          {rupiah(state.amount)}
        </Text>
      )}
      {state.progress !== null && (
        <View
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel="Pemakaian budget"
          accessibilityValue={{ min: 0, max: 100, now: state.progress }}
          style={{
            height: 8,
            borderRadius: 4,
            backgroundColor: t.color.tint,
            overflow: "hidden",
          }}
        >
          <View
            style={{
              height: 8,
              width: `${state.progress}%`,
              backgroundColor: state.over ? t.color.danger : t.color.action,
            }}
          />
        </View>
      )}
      <Label muted>
        {budget === null
          ? "Atur budget untuk melihat batas pengeluaran harian."
          : `Budget ${rupiah(budget)} · Keluar ${rupiah(expense)}`}
      </Label>
    </Card>
  );
}
