import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, radii, spacing, strokes } from "@sidequest/ui/theme";

import type { QuestItem } from "./demoData";
import { formatTimeLeft } from "./dueAt";
import { LocationPinIcon, PersonIcon } from "./MetaIcons";

export function QuestRow({
  quest,
  now,
  onPress,
}: {
  quest: QuestItem;
  now: number | null;
  onPress: () => void;
}) {
  const red = quest.kind !== "OWN";
  const timeLeft = now === null ? "…" : formatTimeLeft(quest.dueAt, now);
  const expired = timeLeft === "expired";
  return (
    <Pressable
      accessibilityHint="Opens quest details"
      accessibilityLabel={`${quest.title}. ${expired ? "Expired" : `${timeLeft} left`}. ${quest.location}. ${quest.person}.${quest.attention ? " Needs a decision." : ""}`}
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
              {expired ? "deadline:" : "time left:"}
            </Text>
            <Text style={[styles.time, red && styles.redText]}>{timeLeft}</Text>
          </View>
        </View>
        <View style={styles.metaRow}>
          <LocationPinIcon color={red ? colors.inkInverse : colors.ink} />
          <Text style={[styles.meta, red && styles.redText]}>
            {quest.location}
          </Text>
        </View>
        <View style={styles.metaRow}>
          <PersonIcon color={red ? colors.inkInverse : colors.ink} />
          <Text style={[styles.meta, red && styles.redText]}>
            {quest.person}
          </Text>
        </View>
        {quest.description ? (
          <Text style={[styles.description, red && styles.redMuted]}>
            {quest.description}
          </Text>
        ) : null}
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
    borderWidth: strokes.card,
    minHeight: 44,
    padding: spacing.md,
  },
  yellow: {
    backgroundColor: colors.surface,
    borderColor: colors.surfaceStroke,
  },
  red: {
    backgroundColor: colors.brandDeep,
    borderColor: colors.brandDeepStroke,
  },
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
  metaRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    marginTop: spacing.xs,
  },
  meta: {
    color: colors.ink,
    flex: 1,
    fontSize: 13,
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
