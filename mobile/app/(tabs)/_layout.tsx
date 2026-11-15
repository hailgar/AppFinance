import { Tabs } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useWindowDimensions } from "react-native";
import { theme as t } from "../../src/theme";
export default function TabsLayout() {
  const { fontScale } = useWindowDimensions();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: t.color.action,
        tabBarInactiveTintColor: t.color.muted,
        tabBarStyle: {
          height: Math.max(76, 58 * fontScale),
          paddingTop: 8,
          paddingBottom: 12,
        },
        tabBarLabelStyle: { fontSize: 12 },
        tabBarAllowFontScaling: true,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Hari Ini",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="sunny-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: "Riwayat",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="time-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="summary"
        options={{
          title: "Ringkasan",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="bar-chart-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Pengaturan",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings-outline" color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
