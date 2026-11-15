import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "../../src/session";
import { businessDate, type Dashboard, rupiah } from "../../src/domain";
import { BudgetCard } from "../../src/components/BudgetCard";
import { Transactions } from "../../src/components/Transactions";
import {
  Button,
  Card,
  Label,
  Loading,
  Problem,
  Screen,
  Title,
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
      <Label muted>
        {new Intl.DateTimeFormat("id-ID", {
          timeZone: "Asia/Jakarta",
          dateStyle: "full",
        }).format(new Date(today + "T12:00:00+07:00"))}{" "}
        · WIB
      </Label>
      <Title>Hari ini, lebih terarah.</Title>
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
          />
          <Button
            title="Atur budget"
            secondary
            onPress={() => router.push("/budget")}
          />
          <Card>
            <Label>Pemasukan hari ini</Label>
            <Label>{rupiah(q.data.income_total)}</Label>
            <Label muted>
              Pemasukan tidak menambah budget secara otomatis.
            </Label>
          </Card>
          <Button
            title="Catat transaksi"
            onPress={() => router.push("/transaction")}
          />
          <Title>Transaksi terbaru</Title>
          <Transactions items={q.data.recent_transactions} />
        </>
      )}
    </Screen>
  );
}
