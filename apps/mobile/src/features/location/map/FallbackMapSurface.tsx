import { useMemo, useState } from "react";
import {
  AccessibilityInfo,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from "react-native";

import type { Coordinates } from "@sidequest/contracts/location";
import { distanceMeters } from "@sidequest/location";
import { colors, radii, spacing } from "@sidequest/ui/theme";

import {
  formatDistance,
  markerStyleFor,
  type QuestMarker,
} from "./markerRegistry";
import { clampToEdge, fitViewport, isOnScreen, project } from "./projection";

export type FallbackMapSurfaceProps = {
  /** The player's own position. Null before the first fix. */
  playerPosition: Coordinates | null;
  markers: readonly QuestMarker[];
  selectedMarkerId: string | null;
  onSelectMarker: (markerId: string) => void;
  /** Coarse party presence count, rendered as a HUD badge, not as pins. */
  nearbyPartyCount?: number;
  nearbyAreaLabel?: string;
};

/**
 * The deterministic game-world map.
 *
 * This is not a placeholder for a "real" map: it is the surface the app uses
 * whenever Mapbox has no token or no native module, which includes Expo Go, CI,
 * and any demo run without credentials. It projects genuine coordinates, so
 * markers sit in true relative positions and walking really does move the
 * player across it.
 *
 * Party members are deliberately absent from the canvas. The server never sends
 * their coordinates, so there is nothing to plot — their presence shows as a
 * coarse HUD badge instead.
 */
export function FallbackMapSurface({
  playerPosition,
  markers,
  selectedMarkerId,
  onSelectMarker,
  nearbyPartyCount = 0,
  nearbyAreaLabel,
}: FallbackMapSurfaceProps) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [reduceMotion, setReduceMotion] = useState(false);

  useMemo(() => {
    void AccessibilityInfo.isReduceMotionEnabled()
      .then(setReduceMotion)
      .catch(() => setReduceMotion(false));
  }, []);

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSize({ width, height });
  };

  const viewport = useMemo(() => {
    const points = [
      ...(playerPosition ? [playerPosition] : []),
      ...markers.map((marker) => marker.coordinates),
    ];
    return fitViewport(points, size, { minSpanMeters: 400 });
  }, [markers, playerPosition, size]);

  const ready = size.width > 0 && size.height > 0;

  const placed = useMemo(() => {
    if (!ready) return [];
    return markers.map((marker) => {
      const point = project(marker.coordinates, viewport);
      const onScreen = isOnScreen(point, viewport, 0);
      return {
        marker,
        point: onScreen ? point : clampToEdge(point, viewport),
        onScreen,
        distance: playerPosition
          ? distanceMeters(playerPosition, marker.coordinates)
          : null,
      };
    });
  }, [markers, playerPosition, ready, viewport]);

  const playerPoint =
    ready && playerPosition ? project(playerPosition, viewport) : null;

  return (
    <View
      accessibilityLabel="SideQuest world map"
      onLayout={onLayout}
      style={styles.map}
    >
      <View style={[styles.road, styles.roadOne]} />
      <View style={[styles.road, styles.roadTwo]} />
      <View style={[styles.road, styles.roadThree]} />

      {!ready ? (
        <View style={styles.center}>
          <Text style={styles.hint}>Loading the world…</Text>
        </View>
      ) : null}

      {ready && !playerPosition ? (
        <View style={styles.center}>
          <Text style={styles.hint}>Waiting for your first location fix…</Text>
        </View>
      ) : null}

      {placed.map(({ marker, point, onScreen, distance }) => {
        const style = markerStyleFor(marker.kind);
        const selected = marker.id === selectedMarkerId;

        return (
          <Pressable
            accessibilityLabel={`${style.accessibilityPrefix}. ${marker.title}.${
              distance === null ? "" : ` ${formatDistance(distance)}.`
            } Reward ${marker.rewardCoins} credit.`}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            key={marker.id}
            onPress={() => onSelectMarker(marker.id)}
            style={[
              styles.hitArea,
              {
                height: style.size,
                width: style.size,
                left: point.x - style.size / 2,
                top: point.y - style.size / 2,
              },
              !onScreen && styles.markerOffscreen,
            ]}
          >
            {/* The drawn pin is smaller than the pressable around it, so the
                map stays readable without dropping below a 44pt touch target. */}
            <View
              style={[
                styles.pin,
                {
                  backgroundColor: style.background,
                  borderColor: style.border,
                  height: style.visualSize,
                  width: style.visualSize,
                },
                selected && styles.pinSelected,
                // Pulsing is the "something is happening" signal, so it is the
                // first thing dropped when reduced motion is on.
                style.pulse && !reduceMotion && styles.markerPulse,
              ]}
            >
              <Text style={{ fontSize: style.glyphSize }}>{style.glyph}</Text>
            </View>
            {!onScreen ? <Text style={styles.offscreenArrow}>▸</Text> : null}
          </Pressable>
        );
      })}

      {playerPoint ? (
        <View
          accessibilityLabel="Your position"
          style={[
            styles.player,
            { left: playerPoint.x - 22, top: playerPoint.y - 22 },
          ]}
        >
          <Text style={styles.playerText}>YOU</Text>
        </View>
      ) : null}

      {nearbyPartyCount > 0 ? (
        <View
          accessibilityLabel={`${nearbyPartyCount} party members nearby${
            nearbyAreaLabel ? `, ${nearbyAreaLabel}` : ""
          }`}
          style={styles.presenceBadge}
        >
          <Text style={styles.presenceText}>
            ⚡ {nearbyPartyCount} NEARBY
            {nearbyAreaLabel ? ` · ${nearbyAreaLabel.toUpperCase()}` : ""}
          </Text>
        </View>
      ) : null}

      <View style={styles.scaleBar}>
        <Text style={styles.scaleText}>
          {Math.round(viewport.spanMeters)}m across
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  map: {
    backgroundColor: "#164953",
    borderColor: colors.brand,
    borderRadius: radii.lg,
    borderWidth: 1,
    // No minHeight: the parent decides how tall the map is. A hard minimum
    // here overflows the container on a short viewport — browser chrome at
    // phone width — and paints the map over whatever follows it.
    flex: 1,
    overflow: "hidden",
  },
  // Pinned low rather than centred: the middle of the map is where the player
  // pin and the densest markers sit.
  center: {
    alignItems: "center",
    bottom: spacing.lg,
    justifyContent: "center",
    left: 0,
    position: "absolute",
    right: 0,
  },
  hint: {
    backgroundColor: "rgba(8, 46, 55, 0.82)",
    borderRadius: radii.pill,
    color: colors.surface,
    fontWeight: "700",
    overflow: "hidden",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  road: {
    backgroundColor: "#577178",
    height: 42,
    opacity: 0.35,
    position: "absolute",
    width: "160%",
  },
  roadOne: { left: -60, top: "22%", transform: [{ rotate: "12deg" }] },
  roadTwo: { left: -80, top: "54%", transform: [{ rotate: "-18deg" }] },
  roadThree: { left: -40, top: "78%", transform: [{ rotate: "6deg" }] },
  hitArea: {
    alignItems: "center",
    justifyContent: "center",
    position: "absolute",
  },
  pin: {
    alignItems: "center",
    borderRadius: radii.pill,
    borderWidth: 2,
    justifyContent: "center",
  },
  pinSelected: {
    borderColor: colors.inkInverse,
    borderWidth: 4,
  },
  markerPulse: {
    shadowColor: colors.brand,
    shadowOpacity: 0.9,
    shadowRadius: 12,
  },
  markerOffscreen: { opacity: 0.75 },
  offscreenArrow: {
    color: colors.ink,
    fontSize: 10,
    fontWeight: "900",
    position: "absolute",
    right: 2,
  },
  player: {
    alignItems: "center",
    backgroundColor: colors.brand,
    borderColor: colors.inkInverse,
    borderRadius: radii.pill,
    borderWidth: 3,
    height: 44,
    justifyContent: "center",
    position: "absolute",
    width: 44,
  },
  playerText: { color: colors.ink, fontSize: 9, fontWeight: "900" },
  presenceBadge: {
    backgroundColor: colors.success,
    borderRadius: radii.pill,
    left: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    position: "absolute",
    top: spacing.md,
  },
  presenceText: { color: colors.ink, fontSize: 11, fontWeight: "900" },
  scaleBar: {
    backgroundColor: "rgba(8, 46, 55, 0.75)",
    borderRadius: radii.sm,
    bottom: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    position: "absolute",
    right: spacing.sm,
  },
  scaleText: { color: colors.inkInverse, fontSize: 10, fontWeight: "700" },
});
