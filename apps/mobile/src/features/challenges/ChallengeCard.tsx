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
}: {
  direction: "INCOMING" | "OUTGOING";
  person: string;
  title: string;
  stake: number;
  expires: string;
  onAccept?: () => void;
  onDecline?: () => void;
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
      {direction === "INCOMING" ? (
        <>
          <Text style={styles.safe}>
            Accept only if you want to. Declining has no penalty and never
            shares your location.
          </Text>
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
        </>
      ) : (
        <Text style={styles.safe}>
          Waiting for their choice. No location is shared before acceptance.
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
