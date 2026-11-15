import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "../../src/session";
import { businessDate, rupiah, type Monthly } from "../../src/domain";
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
          if (
            !/^\d{4}-(0[1-9]|1[0-2])$/.test(input) ||
            input > businessDate().slice(0, 7)
          ) {
            setError("Pilih bulan yang valid sampai bulan ini.");
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
        </>
      )}
    </Screen>
  );
}
