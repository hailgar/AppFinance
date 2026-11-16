import { previewApi } from "./fixtures.mjs";
export const useSession = () => ({
  uid: "ui-preview",
  api: previewApi,
  vault: { get: async () => null, clear: async () => undefined },
});
export const currentUserName = () => "Akun contoh";
export const signOutAndClear = async () =>
  window.alert(
    "Ini pratinjau UI. Tidak ada sesi Google atau data keuangan nyata yang terhubung.",
  );
