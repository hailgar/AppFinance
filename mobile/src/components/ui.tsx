import { useNetInfo } from "@react-native-community/netinfo";
import React, { type ComponentProps } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { theme as t } from "../theme";
export type IconName = ComponentProps<typeof Ionicons>["name"];
export function Label({
  children,
  muted = false,
  small = false,
}: {
  children: React.ReactNode;
  muted?: boolean;
  small?: boolean;
}) {
  return (
    <Text
      style={{
        fontSize: small ? 14 : 16,
        lineHeight: small ? 21 : 24,
        color: muted ? t.color.muted : t.color.text,
      }}
    >
      {children}
    </Text>
  );
}
export function Eyebrow({ children }: { children: React.ReactNode }) {
  return <Text style={styles.eyebrow}>{children}</Text>;
}
export function Title({ children }: { children: React.ReactNode }) {
  return (
    <Text accessibilityRole="header" style={styles.title}>
      {children}
    </Text>
  );
}
export function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <Text accessibilityRole="header" style={styles.sectionHeading}>
      {children}
    </Text>
  );
}
export function ScreenHeading({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <View style={{ gap: 6 }}>
      {!!subtitle && (
        <Label muted small>
          {subtitle}
        </Label>
      )}
      <Title>{title}</Title>
    </View>
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
export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.card, style]}>{children}</View>;
}
export function AppHeader({ onAccountPress }: { onAccountPress: () => void }) {
  return (
    <View style={styles.row}>
      <View
        style={{
          flexDirection: "row",
          gap: 8,
          alignItems: "center",
          flex: 1,
          flexWrap: "wrap",
        }}
      >
        <View style={styles.brandMark}>
          <Ionicons name="book-outline" size={19} color={t.color.surface} />
        </View>
        <Text
          style={{
            fontSize: 19,
            flexShrink: 1,
            fontWeight: "700",
            letterSpacing: -0.5,
            color: t.color.text,
          }}
        >
          catat harian<Text style={{ color: t.color.action }}>.</Text>
        </Text>
      </View>
      <Pressable
        onPress={onAccountPress}
        accessibilityRole="button"
        accessibilityLabel="Buka pengaturan akun"
        style={styles.avatar}
      >
        <Ionicons name="person-outline" size={20} color={t.color.action} />
      </Pressable>
    </View>
  );
}
export function Button({
  title,
  onPress,
  disabled = false,
  secondary = false,
  icon,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
  icon?: IconName;
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
      {!!icon && (
        <Ionicons
          name={icon}
          size={20}
          color={secondary ? t.color.action : t.color.surface}
        />
      )}
      <Text
        style={{
          fontSize: 16,
          fontWeight: "600",
          textAlign: "center",
          flexShrink: 1,
          color: secondary ? t.color.action : t.color.surface,
        }}
      >
        {title}
      </Text>
    </Pressable>
  );
}
export function TextButton({
  title,
  onPress,
  icon,
}: {
  title: string;
  onPress: () => void;
  icon?: IconName;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={styles.textButton}
    >
      {!!icon && <Ionicons name={icon} size={15} color={t.color.action} />}
      <Text
        style={{
          fontSize: 14,
          fontWeight: "600",
          color: t.color.action,
          flexShrink: 1,
        }}
      >
        {title}
      </Text>
    </Pressable>
  );
}
export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  disabled = false,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.segments}>
      {options.map((option) => (
        <Pressable
          key={option.value}
          accessibilityRole="button"
          accessibilityLabel={option.label}
          accessibilityState={{ selected: value === option.value, disabled }}
          disabled={disabled}
          onPress={() => onChange(option.value)}
          style={[
            styles.segment,
            value === option.value && { backgroundColor: t.color.surface },
            disabled && { opacity: 0.5 },
          ]}
        >
          <Text
            style={{
              fontSize: 14,
              fontWeight: value === option.value ? "600" : "400",
              color: value === option.value ? t.color.text : t.color.muted,
              textAlign: "center",
            }}
          >
            {option.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
export function Field({
  label,
  error,
  ...props
}: TextInputProps & { label: string; error?: string }) {
  return (
    <View style={{ gap: 8 }}>
      <Label small>{label}</Label>
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
export function AmountField({
  value,
  onChangeText,
  error,
  label = "Nominal transaksi",
}: {
  value: string;
  onChangeText: (value: string) => void;
  error?: string;
  label?: string;
}) {
  return (
    <Card>
      <Eyebrow>{label}</Eyebrow>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text style={{ fontSize: 24, color: t.color.muted }}>Rp</Text>
        <TextInput
          accessibilityLabel={label}
          placeholder="0"
          placeholderTextColor={t.color.muted}
          keyboardType="number-pad"
          value={value}
          onChangeText={onChangeText}
          style={{
            flex: 1,
            minWidth: 0,
            minHeight: 56,
            paddingVertical: 8,
            fontSize: value.length > 10 ? 26 : 36,
            fontWeight: "600",
            color: t.color.text,
          }}
        />
      </View>
      {!!error ? (
        <Text
          accessibilityRole="alert"
          style={{ fontSize: 14, color: t.color.danger }}
        >
          {error}
        </Text>
      ) : (
        <Label small muted>
          Rupiah bulat, tanpa desimal.
        </Label>
      )}
    </Card>
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
  title: {
    fontSize: 26,
    fontWeight: "700",
    letterSpacing: -0.7,
    color: t.color.text,
  },
  sectionHeading: {
    fontSize: 18,
    lineHeight: 26,
    fontWeight: "600",
    color: t.color.text,
  },
  eyebrow: {
    fontSize: 12,
    lineHeight: 18,
    letterSpacing: 0.9,
    textTransform: "uppercase",
    color: t.color.muted,
    fontWeight: "600",
  },
  card: {
    padding: 22,
    gap: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: t.color.line,
    backgroundColor: t.color.surface,
  },
  button: {
    minHeight: 54,
    borderRadius: 14,
    padding: 15,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
  },
  textButton: {
    minHeight: 48,
    paddingHorizontal: 4,
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 1,
  },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: t.color.line,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: t.color.text,
    backgroundColor: t.color.surface,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  },
  brandMark: {
    height: 30,
    width: 30,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: t.color.action,
  },
  avatar: {
    height: 48,
    width: 48,
    borderRadius: 24,
    borderColor: t.color.line,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: t.color.surface,
  },
  segments: {
    padding: 4,
    borderRadius: 14,
    backgroundColor: t.color.neutral,
    flexDirection: "row",
    gap: 4,
  },
  segment: {
    flex: 1,
    minWidth: 0,
    minHeight: 48,
    padding: 10,
    borderRadius: 11,
    justifyContent: "center",
  },
});
