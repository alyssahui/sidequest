import { Pressable, StyleSheet, Text, View } from "react-native";

import type { ArrivalEvaluation } from "@sidequest/contracts/location";
import { arrivalProgress, explainArrival } from "@sidequest/location";
import { CoinAmount, HudCard, StatusPill } from "@sidequest/ui/components";
import { colors, radii, spacing, typeScale } from "@sidequest/ui/theme";

import {
  formatDistance,
  formatTimeRemaining,
  markerStyleFor,
  type QuestMarker,
} from "./markerRegistry";

export type QuestDetailSheetProps = {
  marker: QuestMarker | null;
  distanceMeters: number | null;
  /** Live arrival evaluation when this marker is the tracked objective. */
  arrival: ArrivalEvaluation | null;
  /** Distance when tracking began, used for the progress bar. */
  startedDistanceMeters: number | null;
  /**
   * Current time, or null before the component has mounted.
   *
   * The web build is prerendered to HTML, so any clock-derived text would
   * differ between the server render and the first client render and trip a
   * React hydration mismatch. Time-dependent labels are withheld until the
   * client supplies a clock.
   */
  now: number | null;
  isTracking: boolean;
  onTrack: (marker: QuestMarker) => void;
  onStopTracking: () => void;
};

/**
 * Detail for the selected marker: distance, reward, expiry, and what
 * verification will require. When the quest is being tracked it also shows the
 * live arrival explanation, which states the measurements rather than a bare
 * yes/no.
 */
export function QuestDetailSheet({
  marker,
  distanceMeters,
  arrival,
  startedDistanceMeters,
  now,
  isTracking,
  onTrack,
  onStopTracking,
}: QuestDetailSheetProps) {
  if (!marker) {
    return (
      <HudCard accessibilityLabel="No quest selected">
        <Text style={styles.empty}>
          Tap a marker to see what is happening there.
        </Text>
      </HudCard>
    );
  }

  const style = markerStyleFor(marker.kind);
  const expired = now !== null && Date.parse(marker.expiresAt) <= now;
  const progress =
    arrival && startedDistanceMeters !== null
      ? arrivalProgress(arrival, startedDistanceMeters)
      : null;

  return (
    <HudCard
      accessibilityLabel={`${style.accessibilityPrefix}: ${marker.title}`}
    >
      <View style={styles.row}>
        <StatusPill label={style.label} />
        <CoinAmount amount={marker.rewardCoins} />
      </View>

      <Text accessibilityRole="header" style={styles.title}>
        {style.glyph} {marker.title}
      </Text>

      {marker.detail ? (
        <Text style={styles.detail}>{marker.detail}</Text>
      ) : null}

      <Text style={styles.meta}>
        {distanceMeters === null
          ? "Distance unknown"
          : formatDistance(distanceMeters)}
        {" · "}
        {marker.verificationSummary}
        {" · "}
        {now === null ? "…" : formatTimeRemaining(marker.expiresAt, now)}
        {marker.participantCount
          ? ` · ${marker.participantCount} in the party`
          : ""}
      </Text>

      {arrival ? (
        <View
          accessibilityLabel={`Arrival status: ${explainArrival(arrival)}`}
          style={[styles.arrival, arrival.arrived && styles.arrived]}
        >
          <Text style={styles.arrivalText}>
            {arrival.arrived ? "📍 LOCATION VERIFIED" : "📍 GETTING CLOSER"}
          </Text>
          <Text style={styles.arrivalDetail}>{explainArrival(arrival)}</Text>

          {progress !== null ? (
            <View
              accessibilityLabel={`${Math.round(progress * 100)} percent of the way there`}
              accessibilityRole="progressbar"
              style={styles.progressTrack}
            >
              <View
                style={[styles.progressFill, { width: `${progress * 100}%` }]}
              />
            </View>
          ) : null}
        </View>
      ) : null}

      {expired ? (
        <Text style={styles.expired}>
          This one is gone. Something else will spawn.
        </Text>
      ) : (
        <Pressable
          accessibilityLabel={
            isTracking
              ? "Stop tracking this quest"
              : `Track ${marker.title} with GPS`
          }
          accessibilityRole="button"
          onPress={() => (isTracking ? onStopTracking() : onTrack(marker))}
          style={({ pressed }) => [
            styles.button,
            isTracking && styles.buttonStop,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.buttonText}>
            {isTracking ? "STOP LOCATION SHARING" : "TRACK THIS QUEST"}
          </Text>
        </Pressable>
      )}
    </HudCard>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "space-between",
  },
  title: {
    color: colors.ink,
    fontSize: typeScale.title,
    fontWeight: "900",
    marginTop: spacing.md,
  },
  detail: { color: colors.muted, lineHeight: 21, marginTop: spacing.sm },
  meta: { color: colors.ink, fontSize: 14, marginTop: spacing.sm },
  empty: { color: colors.muted, lineHeight: 21 },
  arrival: {
    backgroundColor: colors.surfaceStrong,
    borderColor: colors.outline,
    borderRadius: radii.sm,
    borderWidth: 1,
    marginTop: spacing.md,
    padding: spacing.sm,
  },
  arrived: { borderColor: colors.success, borderWidth: 2 },
  arrivalText: { color: colors.ink, fontWeight: "900", letterSpacing: 0.6 },
  arrivalDetail: { color: colors.muted, fontSize: 13, marginTop: 4 },
  progressTrack: {
    backgroundColor: colors.outline,
    borderRadius: radii.pill,
    height: 8,
    marginTop: spacing.sm,
    overflow: "hidden",
  },
  progressFill: { backgroundColor: colors.success, height: 8 },
  expired: { color: colors.danger, fontWeight: "700", marginTop: spacing.md },
  button: {
    alignItems: "center",
    backgroundColor: colors.brandDeep,
    borderRadius: radii.sm,
    justifyContent: "center",
    marginTop: spacing.md,
    minHeight: 48,
  },
  buttonStop: { backgroundColor: colors.danger },
  pressed: { opacity: 0.82 },
  buttonText: { color: colors.inkInverse, fontWeight: "900", letterSpacing: 1 },
});
