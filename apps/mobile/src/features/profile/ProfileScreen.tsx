import { Pressable, StyleSheet, Text, View } from "react-native";

import { CoinAmount, HudCard, StatusPill } from "@sidequest/ui/components";
import { colors, radii, spacing, typeScale } from "@sidequest/ui/theme";

import { ScreenFrame } from "../shell/ScreenFrame";

const tags = ["Food", "Photography", "Weird stores", "Hiking"];

export function ProfileScreen() {
  return (
    <ScreenFrame eyebrow="CONFIGURE YOUR CHARACTER" title="ZURI">
      <HudCard style={styles.identity}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>Z</Text>
        </View>
        <View style={styles.grow}>
          <Text style={styles.level}>LEVEL 8 · THE EXPLORER</Text>
          <Text style={styles.meta}>14 quests together this month</Text>
        </View>
        <CoinAmount amount={420} />
      </HudCard>

      <Text style={styles.section}>I LIKE</Text>
      <View style={styles.tags}>
        {tags.map((tag) => (
          <StatusPill key={tag} label={tag.toUpperCase()} />
        ))}
      </View>

      <HudCard>
        <Text style={styles.label}>QUEST STYLE</Text>
        <View style={styles.scale}>
          <Text style={styles.meta}>CHILL</Text>
          <View style={styles.scaleTrack}>
            <View style={styles.scaleFill} />
          </View>
          <Text style={styles.meta}>UNHINGED</Text>
        </View>
        <Text style={styles.label}>SOCIAL · FRIENDS</Text>
      </HudCard>

      <Pressable accessibilityRole="button" style={styles.privacyButton}>
        <Text style={styles.privacyText}>LOCATION SHARING · PAUSED</Text>
      </Pressable>
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  identity: { alignItems: "center", flexDirection: "row", gap: spacing.md },
  avatar: {
    alignItems: "center",
    backgroundColor: colors.brandDeep,
    borderRadius: radii.pill,
    height: 58,
    justifyContent: "center",
    width: 58,
  },
  avatarText: {
    color: colors.inkInverse,
    fontSize: typeScale.title,
    fontWeight: "900",
  },
  grow: { flex: 1 },
  level: { color: colors.ink, fontWeight: "900" },
  meta: { color: colors.muted, fontSize: 12, marginTop: spacing.xs },
  section: { color: colors.brand, fontWeight: "900", letterSpacing: 1.5 },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  label: { color: colors.ink, fontWeight: "900", marginVertical: spacing.sm },
  scale: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
  scaleTrack: {
    backgroundColor: colors.outline,
    borderRadius: radii.pill,
    flex: 1,
    height: 10,
  },
  scaleFill: {
    backgroundColor: colors.brandDeep,
    borderRadius: radii.pill,
    height: 10,
    width: "68%",
  },
  privacyButton: {
    alignItems: "center",
    borderColor: colors.surface,
    borderRadius: radii.sm,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 48,
  },
  privacyText: { color: colors.surface, fontWeight: "900" },
});
