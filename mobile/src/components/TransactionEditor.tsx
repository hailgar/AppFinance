import { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, View } from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { randomUUID } from "expo-crypto";
import { useNetInfo } from "@react-native-community/netinfo";
import {
  businessDate,
  parseAmount,
  rupiah,
  validTransactionDate,
  type Transaction,
  type TransactionType,
} from "../domain";
import { useSession } from "../session";
import {
  Button,
  Card,
  Field,
  Label,
  Loading,
  Problem,
  Screen,
  Title,
} from "./ui";
import { errorMessage } from "../services/api";
import { getCategories } from "../services/resources";
import { CommandFeedback } from "./CommandFeedback";
import type { useFinancialCommand } from "./useFinancialCommand";
const schema = z.object({
  type: z.enum(["EXPENSE", "INCOME"]),
  amount: z.string().refine((value) => {
    try {
      parseAmount(value);
      return true;
    } catch {
      return false;
    }
  }, "Masukkan rupiah bulat antara 1 dan 999.999.999.999."),
  category_code: z.string().min(1, "Pilih kategori."),
  transaction_date: z
    .string()
    .refine(
      (value) => validTransactionDate(value),
      "Pilih tanggal hari ini sampai 366 hari sebelumnya.",
    ),
  note: z.string().max(200, "Catatan maksimal 200 karakter."),
});
type Values = z.infer<typeof schema>;
export function TransactionEditor({
  initial,
  mutation,
  onReviewed,
}: {
  initial?: Transaction;
  mutation: ReturnType<typeof useFinancialCommand>;
  onReviewed: () => void;
}) {
  const s = useSession(),
    network = useNetInfo();
  // Keep the revision that the user actually reviewed; background refresh must not silently rebase a draft.
  const [snapshot] = useState(initial);
  const [editing, setEditing] = useState(!initial);
  const {
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      type: snapshot?.type ?? "EXPENSE",
      amount: snapshot ? String(snapshot.amount) : "",
      category_code: snapshot?.category_code ?? "",
      transaction_date: snapshot?.transaction_date ?? businessDate(),
      note: snapshot?.note ?? "",
    },
  });
  const type = watch("type");
  const categories = useQuery({
    queryKey: [s.uid, "categories", type],
    queryFn: () => getCategories(s.api, type),
  });
  const offline =
    network.isConnected === false || network.isInternetReachable === false;
  const editable = mutation.status === "IDLE";
  async function save(values: Values) {
    const fields = {
      type: values.type,
      amount: parseAmount(values.amount),
      category_code: values.category_code,
      transaction_date: values.transaction_date,
      note: values.note.trim() || null,
    };
    await mutation.run(
      snapshot
        ? {
            key: randomUUID(),
            path: "/transactions/" + snapshot.id,
            method: "PATCH",
            body: JSON.stringify({
              ...fields,
              expected_revision: snapshot.revision,
            }),
          }
        : {
            key: randomUUID(),
            path: "/transactions",
            method: "POST",
            body: JSON.stringify({ id: randomUUID(), ...fields }),
          },
    );
  }
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <Screen>
        <Label muted>
          Hanya pengeluaran yang mengurangi budget. Simpan memerlukan koneksi
          internet.
        </Label>
        {editable && !editing && snapshot && (
          <>
            <Card>
              <Title>{rupiah(snapshot.amount)}</Title>
              <Label>
                {snapshot.type === "EXPENSE" ? "Pengeluaran" : "Pemasukan"} ·{" "}
                {snapshot.transaction_date}
              </Label>
              <Label>
                {categories.data?.find((c) => c.code === snapshot.category_code)
                  ?.label ?? "Kategori transaksi"}
              </Label>
              <Label muted>{snapshot.note || "Tanpa catatan"}</Label>
            </Card>
            <Button
              title="Ubah transaksi"
              disabled={offline}
              onPress={() => setEditing(true)}
            />
            <Button
              title="Hapus transaksi"
              secondary
              disabled={offline}
              onPress={() =>
                Alert.alert(
                  "Hapus transaksi?",
                  "Transaksi ini tidak akan dihitung lagi dalam budget dan ringkasan.",
                  [
                    { text: "Batal", style: "cancel" },
                    {
                      text: "Hapus",
                      style: "destructive",
                      onPress: () =>
                        void mutation.run({
                          key: randomUUID(),
                          path:
                            "/transactions/" +
                            snapshot.id +
                            "?expected_revision=" +
                            snapshot.revision,
                          method: "DELETE",
                        }),
                    },
                  ],
                )
              }
            />
          </>
        )}
        {editable && editing && (
          <>
            <View style={{ gap: 8 }}>
              <Label>Jenis transaksi</Label>
              {(["EXPENSE", "INCOME"] as TransactionType[]).map((value) => (
                <Button
                  key={value}
                  title={
                    (type === value ? "✓ " : "") +
                    (value === "EXPENSE" ? "Pengeluaran" : "Pemasukan")
                  }
                  secondary={type !== value}
                  onPress={() => {
                    setValue("type", value);
                    setValue("category_code", "");
                  }}
                />
              ))}
            </View>
            <Controller
              control={control}
              name="amount"
              render={({ field: { value, onChange } }) => (
                <Field
                  label="Nominal rupiah"
                  placeholder="25000"
                  keyboardType="number-pad"
                  value={value}
                  onChangeText={onChange}
                  error={errors.amount?.message}
                />
              )}
            />
            <Label>Kategori</Label>
            {categories.isPending ? (
              <Loading />
            ) : categories.isError ? (
              <Problem
                message={errorMessage(categories.error)}
                retry={() => void categories.refetch()}
              />
            ) : (
              categories.data.map((category) => (
                <Button
                  key={category.code}
                  title={
                    (watch("category_code") === category.code ? "✓ " : "") +
                    category.label
                  }
                  secondary={watch("category_code") !== category.code}
                  onPress={() => setValue("category_code", category.code)}
                />
              ))
            )}
            {!!errors.category_code && (
              <Label>{errors.category_code.message}</Label>
            )}
            <Controller
              control={control}
              name="transaction_date"
              render={({ field: { value, onChange } }) => (
                <Field
                  label="Tanggal (YYYY-MM-DD, WIB)"
                  value={value}
                  onChangeText={onChange}
                  error={errors.transaction_date?.message}
                />
              )}
            />
            <Controller
              control={control}
              name="note"
              render={({ field: { value, onChange } }) => (
                <Field
                  label="Catatan (opsional)"
                  value={value}
                  onChangeText={onChange}
                  maxLength={200}
                  multiline
                  error={errors.note?.message}
                />
              )}
            />
            <Button
              title="Simpan transaksi"
              disabled={
                offline ||
                !categories.data?.some((c) => c.code === watch("category_code"))
              }
              onPress={() => void handleSubmit(save)()}
            />
          </>
        )}
        <CommandFeedback
          mutation={mutation}
          offline={offline}
          onReviewed={onReviewed}
          onFinished={() => router.back()}
        />
        {offline && (
          <Label>
            Kamu sedang offline. Sambungkan internet untuk menyimpan atau
            memeriksa transaksi.
          </Label>
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}
