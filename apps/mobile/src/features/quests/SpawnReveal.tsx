import { Pressable, StyleSheet, Text, View } from "react-native";
import { CoinAmount } from "@sidequest/ui/components";
import { colors, radii, spacing, typeScale } from "@sidequest/ui/theme";
export function SpawnReveal({
  title,
  reason,
  onAccept,
  onDismiss,
}: {
  title: string;
  reason: string;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  return (
    <View
      accessibilityLabel={`SideQuest spawned: ${title}`}
      style={styles.wrap}
    >
      <Text style={styles.eyebrow}>🍓 SIDEQUEST SPAWNED</Text>
      <Text accessibilityRole="header" style={styles.title}>
        {title}
      </Text>
      <Text style={styles.reason}>{reason}</Text>
      <CoinAmount amount={25} />
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          onPress={onAccept}
          style={styles.primary}
        >
          <Text style={styles.primaryText}>ACCEPT</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={onDismiss}
          style={styles.secondary}
        >
          <Text style={styles.secondaryText}>SKIP — NO PENALTY</Text>
        </Pressable>
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.surfaceStrong,
    borderColor: colors.brand,
    borderRadius: radii.lg,
    borderWidth: 3,
    gap: spacing.sm,
    padding: spacing.lg,
  },
  eyebrow: { color: colors.brandDeep, fontWeight: "900", letterSpacing: 1 },
  title: { color: colors.ink, fontSize: typeScale.title, fontWeight: "900" },
  reason: { color: colors.muted },
  row: { gap: spacing.sm, marginTop: spacing.sm },
  primary: {
    alignItems: "center",
    backgroundColor: colors.brandDeep,
    borderRadius: radii.sm,
    justifyContent: "center",
    minHeight: 48,
  },
  primaryText: { color: colors.inkInverse, fontWeight: "900" },
  secondary: { alignItems: "center", justifyContent: "center", minHeight: 44 },
  secondaryText: { color: colors.ink, fontSize: 12, fontWeight: "800" },
});
