import type { ExpoConfig } from "expo/config";
const config: ExpoConfig = {
  name: "Catat Harian",
  slug: "catat-harian",
  version: "0.1.0",
  scheme: "catat-harian",
  platforms: ["android"],
  orientation: "portrait",
  userInterfaceStyle: "light",
  android: {
    package: process.env.ANDROID_APPLICATION_ID || "id.catatharian.app",
    googleServicesFile:
      process.env.GOOGLE_SERVICES_FILE || "./google-services.json",
    allowBackup: false,
  },
  plugins: [
    "expo-router",
    "@react-native-firebase/app",
    "@react-native-firebase/auth",
    "@react-native-google-signin/google-signin",
    "expo-secure-store",
    ["expo-notifications", { defaultChannel: "daily-reminders" }],
  ],
};
export default config;
