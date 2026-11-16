import { useState } from "react";
import { View } from "react-native";
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
  ScreenHeading,
  SectionHeading,
  SegmentedControl,
  TextButton,
} from "../../src/components/ui";
import { CategoryPicker } from "../../src/components/CategoryPicker";
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
  const [filtersOpen, setFiltersOpen] = useState(false);
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
      <ScreenHeading title="Riwayat transaksi" subtitle="Catatan keuanganmu" />
      <SegmentedControl
        value={type}
        options={[
          { value: "", label: "Semua" },
          { value: "EXPENSE", label: "Keluar" },
          { value: "INCOME", label: "Masuk" },
        ]}
        onChange={(value) => {
          setType(value);
          setCategory("");
          setFilters((current) => ({
            from: current.from,
            to: current.to,
            ...(value ? { type: value } : {}),
          }));
        }}
      />
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <SectionHeading>Daftar transaksi</SectionHeading>
        <TextButton
          title={filtersOpen ? "Tutup filter" : "Filter"}
          icon="options-outline"
          onPress={() => setFiltersOpen((value) => !value)}
        />
      </View>
      {filtersOpen && (
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
            <CategoryPicker
              items={categories.data}
              value={category}
              onChange={setCategory}
              includeType={!type}
            />
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
                setValidation(
                  "Pilih kategori yang sesuai atau semua kategori.",
                );
                return;
              }
              setValidation("");
              setFiltersOpen(false);
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
      )}
      <Label muted small>
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
