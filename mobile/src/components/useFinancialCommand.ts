import { useEffect, useRef, useState } from "react";
import { Alert } from "react-native";
import { usePreventRemove } from "@react-navigation/native";
import { router } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { useSession } from "../session";
import { ApiError, errorMessage } from "../services/api";
import type { Command } from "../services/commands";

export function useFinancialCommand() {
  const { commands } = useSession();
  const qc = useQueryClient();
  const lock = useRef(false);
  const [status, setStatus] = useState<
    "IDLE" | "SAVING" | "UNKNOWN" | "APPLIED" | "CONFLICT"
  >("IDLE");
  const [message, setMessage] = useState("");
  const [authRequired, setAuthRequired] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [previousPending, setPreviousPending] = useState(false);
  const [resourceUnavailable, setResourceUnavailable] = useState(false);
  const busy = status === "SAVING";
  usePreventRemove(!leaving && (busy || status === "UNKNOWN"), () =>
    Alert.alert(
      "Pemeriksaan belum selesai",
      "Periksa penyimpanan terlebih dahulu agar perubahan tidak terulang.",
    ),
  );
  useEffect(() => {
    if (leaving) router.replace("/(tabs)/settings");
  }, [leaving]);
  async function run(command?: Command) {
    if (lock.current || status === "APPLIED" || status === "CONFLICT") return;
    lock.current = true;
    setStatus("SAVING");
    setMessage("");
    setAuthRequired(false);
    setResourceUnavailable(false);
    try {
      const result = await commands.run(command);
      if (previousPending && result !== "UNKNOWN") {
        setPreviousPending(false);
        setStatus("IDLE");
        setMessage(
          "Perubahan sebelumnya telah diperiksa. Tinjau data terbaru sebelum menyimpan formulir ini.",
        );
      } else setStatus(result);
      if (result !== "UNKNOWN") void qc.invalidateQueries();
    } catch (error) {
      const authFailure =
        error instanceof ApiError && [401, 403].includes(error.status);
      const earlierWrite =
        error instanceof Error && error.message === "UNRESOLVED_COMMAND";
      setStatus(authFailure || earlierWrite ? "UNKNOWN" : "IDLE");
      setAuthRequired(authFailure);
      setResourceUnavailable(error instanceof ApiError && error.status === 404);
      if (earlierWrite) setPreviousPending(true);
      setMessage(
        earlierWrite
          ? "Ada perubahan sebelumnya yang perlu diperiksa terlebih dahulu."
          : errorMessage(error),
      );
    } finally {
      lock.current = false;
    }
  }
  return {
    status,
    busy,
    message,
    authRequired,
    previousPending,
    resourceUnavailable,
    run,
    recoverAccount: () => setLeaving(true),
    reviewed: () => {
      if (status === "CONFLICT") {
        setStatus("IDLE");
        setMessage("");
      }
    },
  };
}
