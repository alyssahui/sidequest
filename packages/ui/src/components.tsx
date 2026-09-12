import type { PropsWithChildren } from "react";
import { StyleSheet, Text, View, type ViewProps } from "react-native";

import { colors, radii, spacing } from "./theme";

export function HudCard({
  children,
  style,
  ...props
}: PropsWithChildren<ViewProps>) {
  return (
    <View {...props} style={[styles.card, style]}>
      {children}
    </View>
  );
}

export function CoinAmount({ amount }: { amount: number }) {
  return (
    <Text accessibilityLabel={`${amount} credit`} style={styles.coins}>
      ◉ {amount}
    </Text>
  );
}

export function StatusPill({ label }: { label: string }) {
  return (
    <View style={styles.pill}>
      <Text style={styles.pillText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.outline,
    borderRadius: radii.md,
    borderWidth: 1,
    padding: spacing.md,
  },
  coins: { color: colors.brandDeep, fontSize: 16, fontWeight: "900" },
  pill: {
    alignSelf: "flex-start",
    backgroundColor: colors.brand,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  pillText: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.7,
  },
});
