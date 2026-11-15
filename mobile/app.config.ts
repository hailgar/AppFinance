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
    blockedPermissions: [
      "android.permission.SCHEDULE_EXACT_ALARM",
      "android.permission.USE_EXACT_ALARM",
    ],
  },
  plugins: [
    "expo-router",
    "@react-native-firebase/app",
    "@react-native-firebase/auth",
    "@react-native-google-signin/google-signin",
    "expo-secure-store",
    "expo-notifications",
    "@react-native-community/datetimepicker",
  ],
};
export default config;
