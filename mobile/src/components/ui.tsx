import { useNetInfo } from "@react-native-community/netinfo";
import React from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import { theme as t } from "../theme";
export function Label({
  children,
  muted = false,
}: {
  children: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <Text
      style={{
        fontSize: 16,
        lineHeight: 24,
        color: muted ? t.color.muted : t.color.text,
      }}
    >
      {children}
    </Text>
  );
}
export function Title({ children }: { children: React.ReactNode }) {
  return (
    <Text accessibilityRole="header" style={styles.title}>
      {children}
    </Text>
  );
}
export function Screen({ children }: { children: React.ReactNode }) {
  const network = useNetInfo();
  const offline =
    network.isConnected === false || network.isInternetReachable === false;
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.screen}
    >
      {offline && (
        <Text
          accessibilityRole="alert"
          style={{ fontSize: 16, color: t.color.warning }}
        >
          Kamu sedang offline. Data yang tampil mungkin belum diperbarui.
        </Text>
      )}
      {children}
    </ScrollView>
  );
}
export function Card({ children }: { children: React.ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}
export function Button({
  title,
  onPress,
  disabled = false,
  secondary = false,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: secondary ? t.color.surface : t.color.action,
          borderWidth: secondary ? 1 : 0,
          borderColor: t.color.line,
          opacity: disabled ? 0.5 : pressed ? 0.75 : 1,
        },
      ]}
    >
      <Text
        style={{
          fontSize: 16,
          fontWeight: "600",
          textAlign: "center",
          color: secondary ? t.color.action : "#FFFFFF",
        }}
      >
        {title}
      </Text>
    </Pressable>
  );
}
export function Field({
  label,
  error,
  ...props
}: TextInputProps & { label: string; error?: string }) {
  return (
    <View style={{ gap: 8 }}>
      <Label>{label}</Label>
      <TextInput {...props} accessibilityLabel={label} style={styles.input} />
      {!!error && (
        <Text
          accessibilityRole="alert"
          style={{ color: t.color.danger, fontSize: 14 }}
        >
          {error}
        </Text>
      )}
    </View>
  );
}
export function Loading() {
  return (
    <View accessibilityLabel="Sedang memuat" style={{ padding: 24 }}>
      <ActivityIndicator color={t.color.action} />
    </View>
  );
}
export function Problem({
  message,
  retry,
}: {
  message: string;
  retry: () => void;
}) {
  return (
    <Card>
      <Text
        accessibilityRole="alert"
        style={{ color: t.color.danger, fontSize: 16 }}
      >
        {message}
      </Text>
      <Button title="Coba lagi" onPress={retry} secondary />
    </Card>
  );
}
export const styles = StyleSheet.create({
  screen: {
    padding: 24,
    gap: 24,
    paddingBottom: 40,
    flexGrow: 1,
    backgroundColor: t.color.background,
  },
  title: { fontSize: 28, fontWeight: "700", color: t.color.text },
  card: {
    padding: 20,
    gap: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: t.color.line,
    backgroundColor: t.color.surface,
  },
  button: {
    minHeight: 48,
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: t.color.line,
    borderRadius: 12,
    padding: 14,
    fontSize: 18,
    color: t.color.text,
    backgroundColor: t.color.surface,
  },
});
