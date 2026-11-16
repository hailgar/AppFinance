import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "../../src/session";
import {
  businessDate,
  rupiah,
  validSummaryMonth,
  type Monthly,
} from "../../src/domain";
import {
  Button,
  Card,
  Field,
  Label,
  Loading,
  Problem,
  Screen,
  Title,
} from "../../src/components/ui";
import { errorMessage } from "../../src/services/api";
export default function Summary() {
  const { uid, api } = useSession();
  const [input, setInput] = useState(businessDate().slice(0, 7)),
    [month, setMonth] = useState(input);
  const [error, setError] = useState("");
  const q = useQuery({
    queryKey: [uid, "summary", month],
    queryFn: async () =>
      (await api<Monthly>("/summary/monthly?month=" + month)).data,
  });
  return (
    <Screen>
      <Title>Ringkasan</Title>
      <Field label="Bulan (YYYY-MM)" value={input} onChangeText={setInput} />
      <Button
        title="Tampilkan"
        secondary
        onPress={() => {
          if (!validSummaryMonth(input)) {
            setError(
              "Pilih bulan dalam riwayat 366 hari terakhir sampai bulan ini.",
            );
            return;
          }
          setError("");
          setMonth(input);
        }}
      />
      {!!error && <Label>{error}</Label>}
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <Problem
          message={errorMessage(q.error)}
          retry={() => void q.refetch()}
        />
      ) : (
        <>
          <Card>
            <Label>Pemasukan · {rupiah(q.data.income_total)}</Label>
            <Label>Pengeluaran · {rupiah(q.data.expense_total)}</Label>
            <Title>{rupiah(q.data.net_flow)}</Title>
            <Label muted>
              Selisih periode — angka ini bukan saldo rekening.
            </Label>
          </Card>
          <Title>Pengeluaran per kategori</Title>
          {q.data.expenses_by_category.length === 0 ? (
            <Label muted>Belum ada pengeluaran pada bulan ini.</Label>
          ) : (
            q.data.expenses_by_category.map((item) => (
              <Card key={item.category_code}>
                <Label>{item.category_label}</Label>
                <Label>
                  {rupiah(item.amount)} ·{" "}
                  {q.data.expense_total > 0
                    ? ((item.amount / q.data.expense_total) * 100).toFixed(1)
                    : "0"}
                  % dari pengeluaran
                </Label>
              </Card>
            ))
          )}
        </>
      )}
    </Screen>
  );
}
