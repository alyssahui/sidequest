import type { PropsWithChildren } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors, spacing, typeScale } from "@sidequest/ui/theme";

type Props = PropsWithChildren<{
  title: string;
  eyebrow?: string;
  scroll?: boolean;
}>;

export function ScreenFrame({
  children,
  title,
  eyebrow,
  scroll = true,
}: Props) {
  const content = (
    <View style={styles.content}>
      {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
      <Text accessibilityRole="header" style={styles.title}>
        {title}
      </Text>
      {children}
    </View>
  );

  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      {scroll ? (
        <ScrollView contentContainerStyle={styles.scroll}>{content}</ScrollView>
      ) : (
        content
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.canvas, flex: 1 },
  scroll: { flexGrow: 1 },
  content: { flex: 1, gap: spacing.md, padding: spacing.md },
  eyebrow: {
    color: colors.brand,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 2,
  },
  title: {
    color: colors.inkInverse,
    fontSize: typeScale.hero,
    fontWeight: "900",
  },
});
