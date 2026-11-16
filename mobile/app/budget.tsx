import { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform } from "react-native";
import { router } from "expo-router";
import { randomUUID } from "expo-crypto";
import { useQuery } from "@tanstack/react-query";
import { useNetInfo } from "@react-native-community/netinfo";
import { useSession } from "../src/session";
import {
  businessDate,
  defaultRevision,
  parseAmount,
  rupiah,
  validBudgetDate,
  type BudgetDefault,
  type EffectiveBudget,
  type Page,
} from "../src/domain";
import { errorMessage } from "../src/services/api";
import {
  Button,
  Card,
  Field,
  AmountField,
  ScreenHeading,
  SegmentedControl,
  Label,
  Loading,
  Problem,
  Screen,
  Title,
} from "../src/components/ui";
import { useFinancialCommand } from "../src/components/useFinancialCommand";
import { CommandFeedback } from "../src/components/CommandFeedback";

type Mode = "DEFAULT" | "OVERRIDE";
function Editor({
  mode,
  date,
  effective,
  defaults,
  reload,
  mutation,
}: {
  mode: Mode;
  date: string;
  effective: EffectiveBudget;
  defaults: BudgetDefault[];
  reload: () => Promise<void>;
  mutation: ReturnType<typeof useFinancialCommand>;
}) {
  const [snapshot] = useState(() => ({
    revision:
      mode === "DEFAULT"
        ? defaultRevision(defaults, date)
        : effective.override_revision,
    active: effective.override_active,
  }));
  const [amount, setAmount] = useState(() => {
    const initial =
      mode === "DEFAULT"
        ? defaults.find((x) => x.effective_from === date)?.amount
        : effective.override_active
          ? effective.amount
          : null;
    return initial == null ? "" : String(initial);
  });
  const [validation, setValidation] = useState("");
  const network = useNetInfo();
  const offline =
    network.isConnected === false || network.isInternetReachable === false;
  const path =
    mode === "DEFAULT" ? "/budgets/defaults/" + date : "/budgets/daily/" + date;
  const editable = mutation.status === "IDLE";
  async function save() {
    try {
      const value = parseAmount(amount, true);
      if (!validBudgetDate(date, mode))
        throw Error(
          "Tanggal budget sudah tidak berlaku. Pilih tanggal kembali.",
        );
      setValidation("");
      await mutation.run({
        key: randomUUID(),
        path,
        method: "PUT",
        body: JSON.stringify({
          amount: value,
          expected_revision: snapshot.revision,
        }),
      });
    } catch (error) {
      setValidation(
        error instanceof Error ? error.message : "Periksa nominal budget.",
      );
    }
  }
  return (
    <>
      <Card>
        <Label>Budget efektif {date}</Label>
        <Title>
          {effective.amount === null
            ? "Belum diatur"
            : rupiah(effective.amount)}
        </Title>
        <Label muted>
          {effective.source === "OVERRIDE"
            ? "Khusus tanggal ini"
            : effective.source === "DEFAULT"
              ? "Mengikuti default mulai " + effective.effective_from
              : "Belum ada default atau budget khusus"}
        </Label>
      </Card>
      {editable && (
        <>
          <AmountField
            label="Budget rupiah (boleh Rp0)"
            value={amount}
            onChangeText={setAmount}
            error={validation || undefined}
          />
          <Label muted>
            {mode === "DEFAULT"
              ? "Default berlaku mulai tanggal pilihan sampai ada default berikutnya. Tanggal sebelumnya tidak berubah."
              : "Budget khusus hanya mengubah tanggal pilihan. Menghapusnya mengembalikan default yang berlaku."}
          </Label>
          <Button
            title="Simpan budget"
            disabled={offline}
            onPress={() => void save()}
          />
          {mode === "OVERRIDE" && snapshot.active && (
            <Button
              title="Hapus budget khusus tanggal ini"
              secondary
              disabled={offline}
              onPress={() =>
                Alert.alert(
                  "Hapus budget khusus?",
                  "Tanggal ini akan kembali mengikuti default yang berlaku, atau menjadi belum diatur bila tidak ada default.",
                  [
                    { text: "Batal", style: "cancel" },
                    {
                      text: "Hapus",
                      style: "destructive",
                      onPress: () =>
                        void mutation.run({
                          key: randomUUID(),
                          path:
                            path + "?expected_revision=" + snapshot.revision,
                          method: "DELETE",
                        }),
                    },
                  ],
                )
              }
            />
          )}
        </>
      )}
      <CommandFeedback
        mutation={mutation}
        offline={offline}
        onFinished={() => router.back()}
        onReviewed={() => void reload()}
      />
      {offline && (
        <Label>
          Sambungkan internet untuk menyimpan atau memeriksa budget.
        </Label>
      )}
    </>
  );
}
export default function Budget() {
  const { api, uid } = useSession();
  const mutation = useFinancialCommand();
  const locked = mutation.status !== "IDLE";
  const [mode, setMode] = useState<Mode>("OVERRIDE");
  const [input, setInput] = useState(businessDate());
  const [date, setDate] = useState(input);
  const [validation, setValidation] = useState("");
  const [version, setVersion] = useState(0);
  const q = useQuery({
    queryKey: [uid, "budget-editor", date],
    queryFn: async () => {
      const [effective, defaults] = await Promise.all([
        api<EffectiveBudget>("/budgets/effective?date=" + date),
        api<Page<BudgetDefault>>("/budgets/defaults"),
      ]);
      return { effective: effective.data, defaults: defaults.data.items };
    },
  });
  function changeMode(next: Mode) {
    setMode(next);
    setDate(businessDate());
    setInput(businessDate());
    setValidation("");
  }
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <Screen>
        <ScreenHeading
          title="Tetapkan batas harianmu."
          subtitle="Budget yang mengikuti kebutuhanmu"
        />
        <Label muted>
          Budget bukan saldo rekening. Pemasukan tidak menambah budget secara
          otomatis.
        </Label>
        <SegmentedControl
          value={mode}
          options={[
            { value: "OVERRIDE", label: "Khusus tanggal" },
            { value: "DEFAULT", label: "Default harian" },
          ]}
          disabled={locked}
          onChange={changeMode}
        />
        <Field
          label={
            mode === "DEFAULT"
              ? "Mulai berlaku (YYYY-MM-DD, WIB)"
              : "Tanggal (YYYY-MM-DD, WIB)"
          }
          value={input}
          onChangeText={setInput}
          editable={!locked}
          error={validation || undefined}
        />
        <Button
          title="Tampilkan tanggal"
          secondary
          disabled={locked}
          onPress={() => {
            if (!validBudgetDate(input, mode)) {
              setValidation(
                mode === "DEFAULT"
                  ? "Pilih hari ini sampai 366 hari mendatang."
                  : "Pilih tanggal dalam 366 hari sebelum/sesudah hari ini.",
              );
              return;
            }
            setValidation("");
            setDate(input);
          }}
        />
        {q.isPending ? (
          <Loading />
        ) : q.isError ? (
          <Problem
            message={errorMessage(q.error)}
            retry={() => void q.refetch()}
          />
        ) : (
          <Editor
            key={mode + date + version}
            mutation={mutation}
            mode={mode}
            date={date}
            effective={q.data.effective}
            defaults={q.data.defaults}
            reload={async () => {
              const result = await q.refetch();
              if (result.isSuccess) {
                setVersion((x) => x + 1);
                mutation.reviewed();
              }
            }}
          />
        )}
        {q.data && mode === "DEFAULT" && (
          <Card>
            <Label>Default yang tersimpan</Label>
            {q.data.defaults.length === 0 ? (
              <Label muted>Belum ada default harian.</Label>
            ) : (
              q.data.defaults.map((item) => (
                <Label key={item.effective_from}>
                  Mulai {item.effective_from} · {rupiah(item.amount)}
                </Label>
              ))
            )}
          </Card>
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}
