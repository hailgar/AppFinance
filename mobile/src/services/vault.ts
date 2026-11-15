import * as SecureStore from "expo-secure-store";
import type { Vault, Command } from "./commands";
export function vaultFor(uid: string): Vault {
  const key =
    "command." +
    Array.from(uid)
      .map((c) => c.charCodeAt(0).toString(16))
      .join("-");
  return {
    get: async () => {
      const raw = await SecureStore.getItemAsync(key);
      return raw ? (JSON.parse(raw) as Command) : null;
    },
    set: async (command) => {
      const raw = JSON.stringify(command);
      if (encodeURIComponent(raw).replace(/%[A-F\d]{2}/gi, "x").length > 1800)
        throw Error("Command terlalu besar untuk penyimpanan aman.");
      await SecureStore.setItemAsync(key, raw);
    },
    clear: () => SecureStore.deleteItemAsync(key),
  };
}
