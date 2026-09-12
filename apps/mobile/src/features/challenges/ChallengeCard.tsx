import { Pressable, StyleSheet, Text, View } from "react-native";
import { CoinAmount, HudCard, StatusPill } from "@sidequest/ui/components";
import { colors, radii, spacing, typeScale } from "@sidequest/ui/theme";
export function ChallengeCard({
  direction,
  person,
  title,
  stake,
  expires,
  onAccept,
  onDecline,
  status = "PENDING",
  progress = 0,
  explanation,
}: {
  direction: "INCOMING" | "OUTGOING";
  person: string;
  title: string;
  stake: number;
  expires: string;
  onAccept?: () => void;
  onDecline?: () => void;
  status?: string;
  progress?: number;
  explanation?: string;
}) {
  return (
    <HudCard
      accessibilityLabel={`${direction.toLowerCase()} challenge with ${person}`}
    >
      <View style={styles.top}>
        <StatusPill label={`⚔ ${direction}`} />
        <CoinAmount amount={stake} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.meta}>
        {person} · symmetric stake · {expires} left
      </Text>
      <Text style={styles.status}>
        STATUS: {status} · {progress}% COMPLETE
      </Text>
      {explanation ? (
        <Text style={styles.explanation}>{explanation}</Text>
      ) : null}
      {direction === "INCOMING" && status === "PENDING" ? (
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            onPress={onAccept}
            style={styles.accept}
          >
            <Text style={styles.acceptText}>ACCEPT DUEL</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={onDecline}
            style={styles.decline}
          >
            <Text style={styles.declineText}>DECLINE</Text>
          </Pressable>
        </View>
      ) : (
        <Text style={styles.safe}>
          {status === "REJECTED"
            ? "Declined."
            : status === "ACCEPTED"
              ? "Accepted."
              : "Waiting."}
        </Text>
      )}
    </HudCard>
  );
}
const styles = StyleSheet.create({
  top: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  title: {
    color: colors.ink,
    fontSize: typeScale.title,
    fontWeight: "900",
    marginTop: spacing.md,
  },
  meta: { color: colors.ink, marginTop: spacing.sm },
  status: {
    color: colors.brandDeep,
    fontSize: 12,
    fontWeight: "900",
    marginTop: spacing.sm,
  },
  explanation: {
    color: colors.ink,
    fontWeight: "700",
    lineHeight: 21,
    marginTop: spacing.md,
  },
  safe: { color: colors.muted, lineHeight: 21, marginTop: spacing.md },
  actions: { gap: spacing.sm, marginTop: spacing.md },
  accept: {
    alignItems: "center",
    backgroundColor: colors.brandDeep,
    borderRadius: radii.sm,
    justifyContent: "center",
    minHeight: 48,
  },
  acceptText: { color: colors.inkInverse, fontWeight: "900" },
  decline: { alignItems: "center", justifyContent: "center", minHeight: 44 },
  declineText: { color: colors.ink, fontWeight: "800" },
});
