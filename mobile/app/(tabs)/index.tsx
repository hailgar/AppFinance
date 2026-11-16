import { useEffect, useState } from "react";
import { AppState, View } from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "../../src/session";
import { businessDate, type Dashboard } from "../../src/domain";
import { BudgetCard } from "../../src/components/BudgetCard";
import { Transactions } from "../../src/components/Transactions";
import {
  Button,
  AppHeader,
  ScreenHeading,
  SectionHeading,
  TextButton,
  Loading,
  Problem,
  Screen,
} from "../../src/components/ui";
import { errorMessage } from "../../src/services/api";
export default function Today() {
  const { api, uid } = useSession();
  const [today, setToday] = useState(businessDate());
  useEffect(() => {
    const timer = setInterval(() => setToday(businessDate()), 30000);
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") setToday(businessDate());
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, []);
  const q = useQuery({
    queryKey: [uid, "dashboard", today],
    queryFn: async () =>
      (await api<Dashboard>("/dashboard?date=" + today)).data,
  });
  return (
    <Screen>
      <AppHeader onAccountPress={() => router.push("/(tabs)/settings")} />
      <ScreenHeading
        title="Keuangan hari ini"
        subtitle={new Intl.DateTimeFormat("id-ID", {
          timeZone: "Asia/Jakarta",
          dateStyle: "full",
        }).format(new Date(today + "T12:00:00+07:00"))}
      />
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <Problem
          message={errorMessage(q.error)}
          retry={() => void q.refetch()}
        />
      ) : (
        <>
          <BudgetCard
            budget={q.data.budget_amount}
            expense={q.data.expense_total}
            income={q.data.income_total}
            onEdit={() => router.push("/budget")}
          />
          <Button
            title="Catat transaksi"
            icon="add-outline"
            onPress={() => router.push("/transaction")}
          />
          <View style={{ gap: 2 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <SectionHeading>Transaksi terbaru</SectionHeading>
              <TextButton
                title="Lihat semua"
                onPress={() => router.push("/(tabs)/history")}
              />
            </View>
            <Transactions items={q.data.recent_transactions} />
          </View>
        </>
      )}
    </Screen>
  );
}
