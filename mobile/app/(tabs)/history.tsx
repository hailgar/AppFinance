import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useSession } from "../../src/session";
import {
  businessDate,
  validCalendarDate,
  type Page,
  type Transaction,
} from "../../src/domain";
import { Transactions } from "../../src/components/Transactions";
import {
  Button,
  Field,
  Label,
  Loading,
  Problem,
  Screen,
  Title,
} from "../../src/components/ui";
import { errorMessage } from "../../src/services/api";
export default function History() {
  const { uid, api } = useSession();
  const today = businessDate();
  const [from, setFrom] = useState(today.slice(0, 7) + "-01"),
    [to, setTo] = useState(today);
  const [filters, setFilters] = useState({ from, to });
  const [validation, setValidation] = useState("");
  const q = useInfiniteQuery({
    queryKey: [uid, "transactions", filters],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) =>
      (
        await api<Page<Transaction>>(
          "/transactions?" +
            new URLSearchParams({
              ...filters,
              limit: "20",
              ...(pageParam ? { cursor: pageParam } : {}),
            }),
        )
      ).data,
    getNextPageParam: (p) => p.next_cursor || undefined,
  });
  return (
    <Screen>
      <Title>Riwayat</Title>
      <Label muted>Semua catatan, tersusun berdasarkan tanggal.</Label>
      <Field
        label="Dari tanggal (YYYY-MM-DD)"
        value={from}
        onChangeText={setFrom}
      />
      <Field
        label="Sampai tanggal (YYYY-MM-DD)"
        value={to}
        onChangeText={setTo}
      />
      <Button
        secondary
        title="Terapkan rentang"
        onPress={() => {
          const a = Date.parse(from + "T00:00:00Z"),
            b = Date.parse(to + "T00:00:00Z");
          if (
            !validCalendarDate(from) ||
            !validCalendarDate(to) ||
            !Number.isFinite(a) ||
            !Number.isFinite(b) ||
            b < a ||
            (b - a) / 86400000 > 365
          ) {
            setValidation("Pilih rentang tanggal valid, maksimal 366 hari.");
            return;
          }
          setValidation("");
          setFilters({ from, to });
        }}
      />
      {!!validation && <Label>{validation}</Label>}
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <Problem
          message={errorMessage(q.error)}
          retry={() => void q.refetch()}
        />
      ) : (
        <>
          <Transactions items={q.data.pages.flatMap((p) => p.items)} />
          {q.hasNextPage && (
            <Button
              title={q.isFetchingNextPage ? "Memuat…" : "Muat berikutnya"}
              disabled={q.isFetchingNextPage}
              onPress={() => void q.fetchNextPage()}
            />
          )}
        </>
      )}
    </Screen>
  );
}
