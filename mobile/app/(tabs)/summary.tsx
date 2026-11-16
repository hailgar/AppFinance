import { Text, View } from "react-native";
import { theme as t } from "../../src/theme";
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
  ScreenHeading,
  SectionHeading,
  Eyebrow,
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
      <ScreenHeading
        title="Ringkasan bulanan"
        subtitle="Gambaran yang lebih jelas"
      />
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
            <Eyebrow>Selisih periode</Eyebrow>
            <Text
              style={{
                fontSize: Math.abs(q.data.net_flow) > 1_000_000_000 ? 28 : 34,
                fontWeight: "700",
                letterSpacing: -1,
                color: t.color.text,
              }}
            >
              {rupiah(q.data.net_flow)}
            </Text>
            <Label muted small>
              Pemasukan dikurangi pengeluaran. Angka ini bukan saldo rekening.
            </Label>
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: 16,
                paddingTop: 20,
                borderTopWidth: 1,
                borderColor: t.color.line,
              }}
            >
              <View style={{ flexGrow: 1, flexBasis: "42%", gap: 6 }}>
                <Label muted small>
                  Pemasukan
                </Label>
                <SectionHeading>{rupiah(q.data.income_total)}</SectionHeading>
              </View>
              <View style={{ flexGrow: 1, flexBasis: "42%", gap: 6 }}>
                <Label muted small>
                  Pengeluaran
                </Label>
                <SectionHeading>{rupiah(q.data.expense_total)}</SectionHeading>
              </View>
            </View>
          </Card>
          <SectionHeading>Pengeluaran per kategori</SectionHeading>
          {q.data.expenses_by_category.length === 0 ? (
            <Label muted>Belum ada pengeluaran pada bulan ini.</Label>
          ) : (
            q.data.expenses_by_category.map((item) => (
              <View key={item.category_code} style={{ gap: 10 }}>
                <Label>{item.category_label}</Label>
                <Label>
                  {rupiah(item.amount)} ·{" "}
                  {q.data.expense_total > 0
                    ? ((item.amount / q.data.expense_total) * 100).toFixed(1)
                    : "0"}
                  % dari pengeluaran
                </Label>
                <View
                  accessible
                  accessibilityLabel={`${item.category_label}: ${rupiah(item.amount)}`}
                  style={{
                    height: 6,
                    borderRadius: 4,
                    overflow: "hidden",
                    backgroundColor: t.color.neutral,
                  }}
                >
                  <View
                    style={{
                      height: 6,
                      borderRadius: 4,
                      backgroundColor: t.color.action,
                      width: `${q.data.expense_total > 0 ? Math.min(100, (item.amount / q.data.expense_total) * 100) : 0}%`,
                    }}
                  />
                </View>
              </View>
            ))
          )}
        </>
      )}
    </Screen>
  );
}
