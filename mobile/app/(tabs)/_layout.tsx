import { Tabs } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Text, View, useWindowDimensions } from "react-native";
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
          height: Math.max(84, 76 * fontScale),
          paddingTop: 8,
          paddingBottom: 12,
        },
        tabBarLabelStyle: { fontSize: 12, fontWeight: "600" },
        tabBarLabel: ({ children, color }) => (
          <Text
            style={{
              fontSize: 12,
              color,
              textAlign: "center",
              maxWidth: "100%",
            }}
          >
            {children}
          </Text>
        ),
        tabBarIconStyle: { width: 58 },
        tabBarAllowFontScaling: true,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Hari Ini",
          tabBarIcon: ({ color, size, focused }) => (
            <View
              style={{
                width: 58,
                height: 32,
                borderRadius: 18,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: focused ? t.color.tint : "transparent",
              }}
            >
              <Ionicons name="home-outline" color={color} size={size} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: "Riwayat",
          tabBarIcon: ({ color, size, focused }) => (
            <View
              style={{
                width: 58,
                height: 32,
                borderRadius: 18,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: focused ? t.color.tint : "transparent",
              }}
            >
              <Ionicons name="time-outline" color={color} size={size} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="summary"
        options={{
          title: "Ringkasan",
          tabBarIcon: ({ color, size, focused }) => (
            <View
              style={{
                width: 58,
                height: 32,
                borderRadius: 18,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: focused ? t.color.tint : "transparent",
              }}
            >
              <Ionicons name="bar-chart-outline" color={color} size={size} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Pengaturan",
          tabBarIcon: ({ color, size, focused }) => (
            <View
              style={{
                width: 58,
                height: 32,
                borderRadius: 18,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: focused ? t.color.tint : "transparent",
              }}
            >
              <Ionicons name="options-outline" color={color} size={size} />
            </View>
          ),
        }}
      />
    </Tabs>
  );
}
