import { Stack } from "expo-router";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { theme as t } from "../src/theme";
import { Providers } from "../src/session";
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1 }} edges={["top", "left", "right"]}>
        <StatusBar style="dark" />
        <Providers>
          <Stack
            screenOptions={{
              headerShown: false,
              headerTintColor: t.color.action,
              headerTitleStyle: { fontSize: 16 },
              headerShadowVisible: false,
              headerStyle: { backgroundColor: t.color.background },
              contentStyle: { backgroundColor: t.color.background },
            }}
          >
            <Stack.Screen name="(tabs)" />
            <Stack.Screen
              name="budget"
              options={{ headerShown: true, title: "Atur budget" }}
            />
            <Stack.Screen
              name="transaction-detail"
              options={{ headerShown: true, title: "Detail transaksi" }}
            />
            <Stack.Screen
              name="transaction"
              options={{
                presentation: "modal",
                headerShown: true,
                title: "Catat transaksi",
              }}
            />
          </Stack>
        </Providers>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
