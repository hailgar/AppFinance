import { useState } from "react";
export function useReminders() {
  const [preferences, setPreferences] = useState({
    budget_reminder: { enabled: false, time: "08:00" },
    record_reminder: { enabled: false, time: "20:00" },
    revision: 0,
  });
  return {
    state: {
      preferences,
      ready: true,
      serverChecked: false,
      dirty: false,
      pending: null,
      conflict: null,
      active: { budget_reminder: false, record_reminder: false },
      permission: {
        granted: false,
        status: "undetermined",
        canAskAgain: false,
      },
      error:
        "Pratinjau browser: izin dan pengiriman notifikasi Android belum diuji.",
    },
    controller: {
      update: async (kind, enabled, time) =>
        setPreferences((current) => ({
          ...current,
          [kind]: { enabled, time },
        })),
      refresh: async () => undefined,
      resolveConflict: async () => undefined,
      test: async () => {
        throw Error(
          "Notifikasi Android tidak dijadwalkan dari pratinjau browser ini.",
        );
      },
    },
  };
}
