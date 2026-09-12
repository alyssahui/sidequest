import { Pressable, StyleSheet, Text, View } from "react-native";

import { CoinAmount, HudCard, StatusPill } from "@sidequest/ui/components";
import { colors, radii, spacing, typeScale } from "@sidequest/ui/theme";

import { ScreenFrame } from "./ScreenFrame";

export function MapScreen() {
  return (
    <ScreenFrame
      eyebrow="LIVE WORLD · DEMO MODE"
      scroll={false}
      title="SIDEQUEST"
    >
      <View accessibilityLabel="Demo game map" style={styles.map}>
        <View style={[styles.road, styles.roadOne]} />
        <View style={[styles.road, styles.roadTwo]} />
        <View accessibilityLabel="Your position" style={styles.player}>
          <Text style={styles.playerText}>YOU</Text>
        </View>
        <View
          accessibilityLabel="Nearby food quest, 300 meters"
          style={styles.marker}
        >
          <Text style={styles.markerText}>🍓</Text>
        </View>
        <View
          accessibilityLabel="Multiplayer quest"
          style={[styles.marker, styles.markerAlt]}
        >
          <Text style={styles.markerText}>⚡</Text>
        </View>
      </View>

      <HudCard accessibilityLabel="Selected nearby quest">
        <View style={styles.row}>
          <StatusPill label="SIDEQUEST SPAWNED" />
          <CoinAmount amount={30} />
        </View>
        <Text style={styles.questTitle}>
          Try something you have never eaten
        </Text>
        <Text style={styles.meta}>300m away · GPS + PHOTO · 42 min left</Text>
        <Pressable accessibilityRole="button" style={styles.button}>
          <Text style={styles.buttonText}>VIEW QUEST</Text>
        </Pressable>
      </HudCard>
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  map: {
    backgroundColor: "#164953",
    borderColor: colors.brand,
    borderRadius: radii.lg,
    borderWidth: 1,
    flex: 1,
    minHeight: 280,
    overflow: "hidden",
  },
  road: {
    backgroundColor: "#577178",
    height: 42,
    opacity: 0.5,
    position: "absolute",
    width: "140%",
  },
  roadOne: { left: -50, top: 90, transform: [{ rotate: "12deg" }] },
  roadTwo: { left: -70, top: 190, transform: [{ rotate: "-18deg" }] },
  player: {
    alignItems: "center",
    backgroundColor: colors.brand,
    borderColor: colors.inkInverse,
    borderRadius: radii.pill,
    borderWidth: 3,
    height: 58,
    justifyContent: "center",
    left: "42%",
    position: "absolute",
    top: "46%",
    width: 58,
  },
  playerText: { color: colors.ink, fontSize: 11, fontWeight: "900" },
  marker: {
    alignItems: "center",
    backgroundColor: colors.surfaceStrong,
    borderColor: colors.brand,
    borderRadius: radii.pill,
    borderWidth: 3,
    height: 52,
    justifyContent: "center",
    left: "19%",
    position: "absolute",
    top: "20%",
    width: 52,
  },
  markerAlt: { left: "70%", top: "68%" },
  markerText: { fontSize: 24 },
  row: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  questTitle: {
    color: colors.ink,
    fontSize: typeScale.title,
    fontWeight: "900",
    marginTop: spacing.md,
  },
  meta: { color: colors.ink, fontSize: 14, marginTop: spacing.sm },
  button: {
    alignItems: "center",
    backgroundColor: colors.brandDeep,
    borderRadius: radii.sm,
    justifyContent: "center",
    marginTop: spacing.md,
    minHeight: 48,
  },
  buttonText: { color: colors.inkInverse, fontWeight: "900", letterSpacing: 1 },
});
