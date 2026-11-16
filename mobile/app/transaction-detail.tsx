import { useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "../src/session";
import type { Transaction } from "../src/domain";
import { TransactionEditor } from "../src/components/TransactionEditor";
import { useFinancialCommand } from "../src/components/useFinancialCommand";
import { Button, Label, Loading, Problem, Screen } from "../src/components/ui";
import { ApiError, errorMessage } from "../src/services/api";
export default function TransactionDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api, uid } = useSession();
  const mutation = useFinancialCommand();
  const [version, setVersion] = useState(0);
  const q = useQuery({
    queryKey: [uid, "transaction", id],
    queryFn: async () =>
      (await api<Transaction>("/transactions/" + encodeURIComponent(id ?? "")))
        .data,
  });
  const missing =
    mutation.resourceUnavailable ||
    (q.error instanceof ApiError && q.error.status === 404);
  if (missing && mutation.status !== "UNKNOWN" && mutation.status !== "SAVING")
    return (
      <Screen>
        <Label>
          {mutation.status === "APPLIED"
            ? "Transaksi sudah dihapus dan dikonfirmasi server."
            : "Transaksi sudah dihapus atau tidak tersedia. Riwayat akan dimuat ulang."}
        </Label>
        <Button
          title="Kembali ke riwayat"
          onPress={() => router.replace("/(tabs)/history")}
        />
      </Screen>
    );
  // Preserve the editor and operation recovery while a pending write is unresolved.
  if (q.data)
    return (
      <TransactionEditor
        key={id + ":" + version}
        initial={q.data}
        mutation={mutation}
        onReviewed={() =>
          void (async () => {
            const result = await q.refetch();
            if (result.isSuccess) {
              setVersion((x) => x + 1);
              mutation.reviewed();
            }
          })()
        }
      />
    );
  return (
    <Screen>
      {q.isPending ? (
        <Loading />
      ) : (
        <Problem
          message={errorMessage(q.error)}
          retry={() => void q.refetch()}
        />
      )}
    </Screen>
  );
}
