import { useRef, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, View } from "react-native";
import { router } from "expo-router";
import { usePreventRemove } from "@react-navigation/native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { randomUUID } from "expo-crypto";
import { useNetInfo } from "@react-native-community/netinfo";
import {
  businessDate,
  parseAmount,
  validTransactionDate,
  type TransactionType,
} from "../src/domain";
import { useSession } from "../src/session";
import {
  Button,
  Field,
  Label,
  Loading,
  Problem,
  Screen,
} from "../src/components/ui";
import { errorMessage } from "../src/services/api";
import { getCategories } from "../src/services/resources";
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
export default function NewTransaction() {
  const s = useSession(),
    qc = useQueryClient(),
    network = useNetInfo();
  const [busy, setBusy] = useState(false),
    [pending, setPending] = useState(false),
    [completed, setCompleted] = useState(false),
    [conflict, setConflict] = useState(false),
    [message, setMessage] = useState("");
  const lock = useRef(false);
  const {
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      type: "EXPENSE",
      amount: "",
      category_code: "",
      transaction_date: businessDate(),
      note: "",
    },
  });
  const type = watch("type");
  const categories = useQuery({
    queryKey: [s.uid, "categories", type],
    queryFn: () => getCategories(s.api, type),
  });
  usePreventRemove(busy || pending, () =>
    Alert.alert(
      "Pemeriksaan belum selesai",
      "Periksa penyimpanan terlebih dahulu.",
    ),
  );
  async function execute(values?: Values) {
    if (lock.current || completed || conflict) return;
    lock.current = true;
    setBusy(true);
    setMessage("");
    try {
      const result = await s.commands.run(
        values
          ? {
              key: randomUUID(),
              path: "/transactions",
              method: "POST",
              body: JSON.stringify({
                id: randomUUID(),
                type: values.type,
                amount: parseAmount(values.amount),
                category_code: values.category_code,
                transaction_date: values.transaction_date,
                note: values.note.trim() || null,
              }),
            }
          : undefined,
      );
      if (result === "UNKNOWN") {
        setPending(true);
        setMessage(
          "Sedang memeriksa penyimpanan. Jangan membuat catatan pengganti.",
        );
      } else {
        await qc.invalidateQueries();
        setPending(false);
        if (result === "CONFLICT") {
          setConflict(true);
          setMessage(
            "Data berubah. Tinjau riwayat terbaru sebelum mencatat kembali.",
          );
        } else {
          setCompleted(true);
        }
      }
    } catch (e) {
      setMessage(errorMessage(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const offline =
    network.isConnected === false || network.isInternetReachable === false;
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
        {completed ? (
          <>
            <Label>
              Transaksi tersimpan. Catatan sudah dikonfirmasi server.
            </Label>
            <Button title="Selesai" onPress={() => router.back()} />
          </>
        ) : conflict ? (
          <>
            <Label>{message}</Label>
            <Button
              title="Tinjau riwayat terbaru"
              onPress={() => router.replace("/(tabs)/history")}
            />
          </>
        ) : pending ? (
          <>
            <Label>{message}</Label>
            <Button
              title={busy ? "Memeriksa…" : "Periksa dan coba kembali"}
              disabled={busy || offline}
              onPress={() => void execute()}
            />
          </>
        ) : (
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
                  disabled={busy}
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
                  editable={!busy}
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
                  disabled={busy}
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
                  editable={!busy}
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
                  editable={!busy}
                  error={errors.note?.message}
                />
              )}
            />
            {!!message && <Label>{message}</Label>}
            <Button
              title={busy ? "Menyimpan…" : "Simpan transaksi"}
              disabled={
                busy ||
                offline ||
                !categories.data?.some((c) => c.code === watch("category_code"))
              }
              onPress={() => void handleSubmit((values) => execute(values))()}
            />
          </>
        )}
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
