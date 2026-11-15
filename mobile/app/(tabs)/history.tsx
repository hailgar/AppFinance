import { useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useSession } from "../../src/session";
import {
  businessDate,
  historyQuery,
  validHistoryRange,
  type Category,
  type Page,
  type Transaction,
  type TransactionType,
} from "../../src/domain";
import { Transactions } from "../../src/components/Transactions";
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
export default function History() {
  const { uid, api } = useSession();
  const today = businessDate();
  const [from, setFrom] = useState(today.slice(0, 7) + "-01"),
    [to, setTo] = useState(today);
  const [type, setType] = useState<TransactionType | "">("");
  const [category, setCategory] = useState("");
  const [filters, setFilters] = useState<{
    from: string;
    to: string;
    type?: TransactionType;
    category_code?: string;
  }>({ from, to });
  const [validation, setValidation] = useState("");
  const categories = useQuery({
    queryKey: [uid, "history-categories", type],
    queryFn: async () =>
      (await api<Page<Category>>("/categories" + (type ? "?type=" + type : "")))
        .data.items,
  });
  const q = useInfiniteQuery({
    queryKey: [uid, "transactions", filters],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) =>
      (await api<Page<Transaction>>(historyQuery(filters, pageParam))).data,
    getNextPageParam: (p) => p.next_cursor || undefined,
  });
  return (
    <Screen>
      <Title>Riwayat</Title>
      <Label muted>Semua catatan, tersusun berdasarkan tanggal.</Label>
      <Card>
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
        <Label>Jenis transaksi</Label>
        {(["", "EXPENSE", "INCOME"] as const).map((value) => (
          <Button
            key={value || "all"}
            title={
              (type === value ? "✓ " : "") +
              (value === ""
                ? "Semua jenis"
                : value === "EXPENSE"
                  ? "Pengeluaran"
                  : "Pemasukan")
            }
            secondary={type !== value}
            onPress={() => {
              setType(value);
              setCategory("");
            }}
          />
        ))}
        <Label>Kategori</Label>
        <Button
          title={(category === "" ? "✓ " : "") + "Semua kategori"}
          secondary={category !== ""}
          onPress={() => setCategory("")}
        />
        {categories.isPending ? (
          <Loading />
        ) : categories.isError ? (
          <Problem
            message={errorMessage(categories.error)}
            retry={() => void categories.refetch()}
          />
        ) : (
          categories.data.map((item) => (
            <Button
              key={item.code}
              title={
                (category === item.code ? "✓ " : "") +
                item.label +
                (!type
                  ? item.type === "EXPENSE"
                    ? " · Keluar"
                    : " · Masuk"
                  : "")
              }
              secondary={category !== item.code}
              onPress={() => setCategory(item.code)}
            />
          ))
        )}
        <Button
          title="Terapkan filter"
          onPress={() => {
            if (!validHistoryRange(from, to)) {
              setValidation(
                "Pilih rentang valid maksimal 366 hari, sampai hari ini dan dalam 366 hari terakhir.",
              );
              return;
            }
            if (
              category &&
              !categories.data?.some((c) => c.code === category)
            ) {
              setValidation("Pilih kategori yang sesuai atau semua kategori.");
              return;
            }
            setValidation("");
            setFilters({
              from,
              to,
              ...(type ? { type } : {}),
              ...(category ? { category_code: category } : {}),
            });
          }}
        />
        {!!validation && <Label>{validation}</Label>}
      </Card>
      <Label muted>
        Menampilkan {filters.from} sampai {filters.to}
        {filters.type
          ? filters.type === "EXPENSE"
            ? " · Pengeluaran"
            : " · Pemasukan"
          : " · Semua jenis"}
      </Label>
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
