import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { Coordinates } from "@sidequest/contracts/location";
import { distanceMeters } from "@sidequest/location";
import { colors, radii, spacing } from "@sidequest/ui/theme";

import type { LocationFeatureConfig } from "../config";
import { FallbackMapSurface } from "./FallbackMapSurface";
import {
  formatDistance,
  markerStyleFor,
  type QuestMarker,
} from "./markerRegistry";

export type MapSurfaceProps = {
  config: LocationFeatureConfig;
  playerPosition: Coordinates | null;
  markers: readonly QuestMarker[];
  selectedMarkerId: string | null;
  onSelectMarker: (markerId: string) => void;
  nearbyPartyCount?: number;
  nearbyAreaLabel?: string;
};

type ScreenPoint = { x: number; y: number };

/** Minimal surface of the MapLibre API this component depends on. */
type MapLibreMap = {
  on(event: string, handler: () => void): void;
  remove(): void;
  project(lngLat: [number, number]): { x: number; y: number };
  fitBounds(
    bounds: [[number, number], [number, number]],
    options: Record<string, unknown>,
  ): void;
  easeTo(options: Record<string, unknown>): void;
  resize(): void;
};

/**
 * The real map, for web.
 *
 * MapLibre GL JS is a browser library: no native module, no development build,
 * and — with raster tiles — no access token, so this satisfies the rule that
 * the app must open without credentials while still showing actual streets.
 *
 * Markers are not MapLibre markers. They are the same React Native views the
 * fallback surface uses, absolutely positioned from `map.project()` and
 * repositioned on every camera move. That keeps one marker registry, one set of
 * accessibility labels, and one visual language across both surfaces.
 *
 * Party members are still absent from the map by construction: the server sends
 * a coarse area and freshness, never peer coordinates, so there is nothing to
 * place.
 */
export function MapSurface({
  config,
  playerPosition,
  markers,
  selectedMarkerId,
  onSelectMarker,
  nearbyPartyCount = 0,
  nearbyAreaLabel,
}: MapSurfaceProps) {
  const containerRef = useRef<View | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [points, setPoints] = useState<Record<string, ScreenPoint>>({});
  const hasFramedRef = useRef(false);

  // Everything the map should keep in view.
  const framed = useMemo(
    () => [
      ...(playerPosition ? [playerPosition] : []),
      ...markers.map((marker) => marker.coordinates),
    ],
    [markers, playerPosition],
  );

  /* ---------------------------------------------------------------- */
  /* Map lifecycle                                                     */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    let cancelled = false;
    let map: MapLibreMap | null = null;

    void (async () => {
      try {
        // Imported dynamically so the ~200KB library is a separate chunk and a
        // failure to load degrades to the fallback rather than breaking boot.
        const maplibre = await import("maplibre-gl");
        await import("maplibre-gl/dist/maplibre-gl.css");

        // On react-native-web a View's ref is the underlying DOM element.
        const container = containerRef.current as unknown as HTMLElement | null;
        if (cancelled || !container) return;

        map = new maplibre.Map({
          container,
          style: {
            version: 8,
            sources: {
              basemap: {
                type: "raster",
                tiles: [config.mapTileUrl],
                tileSize: 256,
                attribution: config.mapAttribution,
              },
            },
            layers: [{ id: "basemap", type: "raster", source: "basemap" }],
          },
          center: [
            playerPosition?.longitude ?? -79.9436,
            playerPosition?.latitude ?? 40.4433,
          ],
          zoom: 14,
          attributionControl: { compact: true },
          // The HUD sits on top of the map; dragging to rotate fights the
          // marker taps and adds nothing for a walking quest.
          pitchWithRotate: false,
          dragRotate: false,
        }) as unknown as MapLibreMap;

        mapRef.current = map;

        if (config.mapDarkenTiles) {
          // Applied to the canvas alone. The markers are sibling DOM nodes, so
          // they keep their real colours; only the basemap is inverted.
          const canvas =
            container.querySelector<HTMLElement>(".maplibregl-canvas");
          if (canvas) {
            canvas.style.filter =
              "invert(1) hue-rotate(180deg) brightness(0.85) contrast(0.92) saturate(0.7)";
          }
        }

        const sync = () => {
          if (cancelled) return;
          setPoints(projectAll(map, playerPosition, markers));
        };

        map.on("load", () => {
          if (cancelled) return;
          setReady(true);
          sync();
        });
        map.on("move", sync);
        map.on("resize", sync);
        map.on("error", () => {
          // A tile failure is not fatal — the camera and markers still work.
        });
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
      mapRef.current = null;
      map?.remove();
    };
    // Built once. Camera and marker updates are handled by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.mapAttribution, config.mapDarkenTiles, config.mapTileUrl]);

  // Frame everything the first time there is something to frame, then follow
  // the player rather than yanking the camera back on every fix.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || framed.length === 0) return;

    if (!hasFramedRef.current) {
      hasFramedRef.current = true;
      const lats = framed.map((c) => c.latitude);
      const lngs = framed.map((c) => c.longitude);
      map.fitBounds(
        [
          [Math.min(...lngs), Math.min(...lats)],
          [Math.max(...lngs), Math.max(...lats)],
        ],
        { padding: 72, maxZoom: 15, duration: 0 },
      );
    } else if (playerPosition) {
      map.easeTo({
        center: [playerPosition.longitude, playerPosition.latitude],
        duration: 600,
      });
    }
    setPoints(projectAll(map, playerPosition, markers));
  }, [framed, markers, playerPosition, ready]);

  if (failed) {
    return (
      <FallbackMapSurface
        markers={markers}
        nearbyAreaLabel={nearbyAreaLabel ?? ""}
        nearbyPartyCount={nearbyPartyCount}
        onSelectMarker={onSelectMarker}
        playerPosition={playerPosition}
        selectedMarkerId={selectedMarkerId}
      />
    );
  }

  const playerPoint = points.__player;

  return (
    <View accessibilityLabel="SideQuest world map" style={styles.wrap}>
      <View ref={containerRef} style={styles.canvas} />

      {!ready ? (
        <View style={styles.loading} pointerEvents="none">
          <Text style={styles.loadingText}>Loading the world…</Text>
        </View>
      ) : null}

      {markers.map((marker) => {
        const point = points[marker.id];
        if (!point) return null;

        const style = markerStyleFor(marker.kind);
        const selected = marker.id === selectedMarkerId;
        const distance = playerPosition
          ? distanceMeters(playerPosition, marker.coordinates)
          : null;

        return (
          <Pressable
            accessibilityLabel={`${style.accessibilityPrefix}. ${marker.title}.${
              distance === null ? "" : ` ${formatDistance(distance)}.`
            } Reward ${marker.rewardCoins} coins.`}
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
              ]}
            >
              <Text style={{ fontSize: style.glyphSize }}>{style.glyph}</Text>
            </View>
          </Pressable>
        );
      })}

      {playerPoint ? (
        <View
          accessibilityLabel="Your position"
          pointerEvents="none"
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
          pointerEvents="none"
          style={styles.presenceBadge}
        >
          <Text style={styles.presenceText}>
            ⚡ {nearbyPartyCount} NEARBY
            {nearbyAreaLabel ? ` · ${nearbyAreaLabel.toUpperCase()}` : ""}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function projectAll(
  map: MapLibreMap | null,
  playerPosition: Coordinates | null,
  markers: readonly QuestMarker[],
): Record<string, ScreenPoint> {
  if (!map) return {};

  const next: Record<string, ScreenPoint> = {};
  for (const marker of markers) {
    const { x, y } = map.project([
      marker.coordinates.longitude,
      marker.coordinates.latitude,
    ]);
    next[marker.id] = { x, y };
  }
  if (playerPosition) {
    const { x, y } = map.project([
      playerPosition.longitude,
      playerPosition.latitude,
    ]);
    next.__player = { x, y };
  }
  return next;
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: "#0d343d",
    borderColor: colors.brand,
    borderRadius: radii.lg,
    borderWidth: 1,
    flex: 1,
    overflow: "hidden",
  },
  canvas: { flex: 1 },
  loading: {
    alignItems: "center",
    bottom: 0,
    justifyContent: "center",
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  loadingText: { color: colors.surface, fontWeight: "700" },
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
  pinSelected: { borderColor: colors.inkInverse, borderWidth: 4 },
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
});
