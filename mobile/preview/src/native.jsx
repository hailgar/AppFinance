export * from "react-native-web";
export const Alert = {
  alert(title, message, choices) {
    const action =
      choices?.find((choice) => choice.style === "destructive") ||
      choices?.find((choice) => choice.style !== "cancel");
    if (!action) {
      window.alert(`${title}\n\n${message}`);
      return;
    }
    if (
      window.confirm(
        `${title}\n\n${message}\n\nHanya mengubah data contoh di pratinjau ini.`,
      )
    )
      action.onPress?.();
  },
};
export const Linking = {
  openSettings: async () =>
    window.alert(
      "Pengaturan Android hanya tersedia pada perangkat Android. Ini pratinjau UI browser.",
    ),
};
