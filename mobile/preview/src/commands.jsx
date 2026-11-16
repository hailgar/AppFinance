import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { previewApi } from "./fixtures.mjs";
export function useFinancialCommand() {
  const [status, setStatus] = useState("IDLE"),
    [message, setMessage] = useState("");
  const client = useQueryClient();
  return {
    status,
    busy: status === "SAVING",
    message,
    authRequired: false,
    previousPending: false,
    resourceUnavailable: false,
    run: async (command) => {
      if (!command) return;
      setStatus("SAVING");
      try {
        await previewApi(command.path, command);
        await client.invalidateQueries();
        setStatus("APPLIED");
      } catch (error) {
        setMessage(error.message);
        setStatus("IDLE");
      }
    },
    recoverAccount: () => undefined,
    reviewed: () => setStatus("IDLE"),
  };
}
