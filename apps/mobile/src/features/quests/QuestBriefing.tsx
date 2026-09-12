import { StyleSheet, Text, View } from "react-native";
import { StatusPill } from "@sidequest/ui/components";
import { colors, spacing } from "@sidequest/ui/theme";

export type QuestBriefingData = {
  explanation: string;
  objective: string;
  timeLabel: string;
  locationLabel: string;
  notes: string[];
};

export function QuestBriefing({ briefing }: { briefing: QuestBriefingData }) {
  return (
    <View accessibilityLabel="Quest briefing" style={styles.wrap}>
      <StatusPill label="MISSION BRIEFING" />
      <Text style={styles.explanation}>{briefing.explanation}</Text>
      <Detail icon="🎯" label="OBJECTIVE" value={briefing.objective} />
      <Detail icon="⏱" label="TIME" value={briefing.timeLabel} />
      <Detail icon="📍" label="LOCATION" value={briefing.locationLabel} />
      <Detail
        icon="📝"
        label="FIELD NOTES"
        value={briefing.notes.join(" · ") || "No extra notes—make it yours."}
      />
    </View>
  );
}

function Detail({
  icon,
  label,
  value,
}: {
  icon: string;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.detail}>
      <Text style={styles.label}>
        {icon} {label}
      </Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderTopColor: colors.outline,
    borderTopWidth: 1,
    gap: spacing.md,
    marginTop: spacing.md,
    paddingTop: spacing.md,
  },
  explanation: {
    color: colors.brandDeep,
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 23,
  },
  detail: { gap: spacing.xs },
  label: {
    color: colors.ink,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
  },
  value: { color: colors.muted, lineHeight: 21 },
});
