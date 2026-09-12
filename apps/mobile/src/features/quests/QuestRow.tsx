import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, radii, spacing } from "@sidequest/ui/theme";

import type { QuestItem } from "./demoData";

export function QuestRow({
  quest,
  onPress,
}: {
  quest: QuestItem;
  onPress: () => void;
}) {
  const red = quest.kind !== "OWN";
  return (
    <Pressable
      accessibilityHint="Opens quest details"
      accessibilityLabel={`${quest.title}. ${quest.timeLeft} left. ${quest.location}. ${quest.person}.${quest.attention ? " Needs a decision." : ""}`}
      accessibilityRole="button"
      onPress={onPress}
    >
      <View style={[styles.card, red ? styles.red : styles.yellow]}>
        <View style={styles.top}>
          <Text style={[styles.title, red && styles.redText]}>
            {quest.title}
          </Text>
          <View>
            <Text style={[styles.timeLabel, red && styles.redMuted]}>
              time left:
            </Text>
            <Text style={[styles.time, red && styles.redText]}>
              {quest.timeLeft}
            </Text>
          </View>
        </View>
        <Text style={[styles.meta, red && styles.redText]}>
          📍 {quest.location}
        </Text>
        <Text style={[styles.meta, red && styles.redText]}>
          👤 {quest.person}
        </Text>
        <Text style={[styles.description, red && styles.redMuted]}>
          {quest.description}
        </Text>
        {quest.attention ? (
          <Text
            accessibilityLabel="Needs attention"
            style={[styles.alert, red && styles.redAlert]}
          >
            ⚠
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.md,
    minHeight: 44,
    padding: spacing.md,
  },
  yellow: { backgroundColor: colors.surface },
  red: { backgroundColor: colors.brandDeep },
  top: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between",
  },
  title: {
    color: colors.ink,
    flex: 1,
    fontSize: 18,
    fontWeight: "800",
  },
  timeLabel: {
    color: colors.ink,
    fontSize: 11,
    fontWeight: "700",
    textAlign: "right",
  },
  time: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: "800",
    textAlign: "right",
  },
  meta: {
    color: colors.ink,
    fontSize: 13,
    marginTop: spacing.xs,
  },
  description: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: spacing.sm,
    paddingRight: spacing.xl,
  },
  alert: {
    alignSelf: "flex-end",
    color: colors.brandDeep,
    fontSize: 22,
    fontWeight: "900",
    marginTop: spacing.xs,
  },
  redText: { color: colors.inkInverse },
  redMuted: { color: colors.surface },
  redAlert: { color: colors.warning },
});
