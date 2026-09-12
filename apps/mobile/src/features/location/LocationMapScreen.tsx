import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";

import type { GpsRequirement } from "@sidequest/contracts/location";
import { distanceMeters, type LocationProvider } from "@sidequest/location";
import { HudCard } from "@sidequest/ui/components";
import { colors, radii, spacing, typeScale } from "@sidequest/ui/theme";

import { ScreenFrame } from "../shell/ScreenFrame";
import { LocationApi } from "./api";
import { LocationPrivacyControls } from "./components/LocationPrivacyControls";
import { PermissionGate } from "./components/PermissionGate";
import { readLocationConfig } from "./config";
import { buildDemoQuestMarkers, demoPlayerStart } from "./demoQuests";
import { MapSurface } from "./map/MapSurface";
import { QuestDetailSheet } from "./map/QuestDetailSheet";
import type { QuestMarker } from "./map/markerRegistry";
import { selectLocationProvider, type ProviderDecision } from "./providers";
import { useDeviceLocation } from "./useDeviceLocation";
import { useLocationSession } from "./useLocationSession";
import { usePartyPresence } from "./usePartyPresence";

const DEMO_PARTY_ID = "party-demo";

/**
 * The MAP tab: the game world.
 *
 * Composes the provider, the session, the map surface, and the privacy
 * controls. Everything here works with no Mapbox token, no database, and no
 * device — the provider falls back to the deterministic simulator and the map
 * to the projected game-world surface.
 */
export function LocationMapScreen() {
  const { height: windowHeight } = useWindowDimensions();
  // Roughly the top 40% of the screen, bounded so it stays a usable map on a
  // short laptop window and does not dominate a tall phone.
  const mapHeight = Math.max(
    260,
    Math.min(440, Math.round(windowHeight * 0.4)),
  );

  const config = useMemo(() => readLocationConfig(), []);
  const api = useMemo(
    () => new LocationApi({ baseUrl: config.apiUrl }),
    [config.apiUrl],
  );

  // Markers are built once against a fixed start so expiry countdowns are
  // stable for the length of the demo rather than resetting on every render.
  const demoStartedAt = useRef(Date.now()).current;

  const markers = useMemo(
    () => buildDemoQuestMarkers(demoStartedAt),
    [demoStartedAt],
  );

  const [provider, setProvider] = useState<LocationProvider | null>(null);
  const [decision, setDecision] = useState<ProviderDecision | null>(null);
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(
    markers[0]?.id ?? null,
  );
  const [trackedMarkerId, setTrackedMarkerId] = useState<string | null>(null);
  const [startedDistance, setStartedDistance] = useState<number | null>(null);
  // Null until mounted: the web build is prerendered, and a clock read during
  // that render would not match the first client render.
  const [now, setNow] = useState<number | null>(null);
  const [showPrivacy, setShowPrivacy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void selectLocationProvider(config).then((selected) => {
      if (cancelled) return;
      setProvider(selected.provider);
      setDecision(selected.decision);
    });
    return () => {
      cancelled = true;
    };
  }, [config]);

  // Drives the expiry countdowns without re-rendering the whole tree per frame.
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(timer);
  }, []);

  const trackedMarker = useMemo(
    () => markers.find((marker) => marker.id === trackedMarkerId) ?? null,
    [markers, trackedMarkerId],
  );

  const requirement: GpsRequirement | undefined = trackedMarker?.requirement;

  // Where the player is, for their own map. No server session, no upload.
  const device = useDeviceLocation({ provider });

  const session = useLocationSession({
    api,
    config,
    provider,
    purpose: "ACTIVE_QUEST",
    ...(trackedMarkerId ? { questInstanceId: trackedMarkerId } : {}),
    ...(requirement ? { requirement } : {}),
  });

  const presence = usePartyPresence({
    api,
    partyId: DEMO_PARTY_ID,
    enabled: session.isTracking,
  });

  const playerPosition =
    // The tracking session's fix is preferred while a quest is running, since
    // it is the one being uploaded as evidence; otherwise the display watch.
    session.sample?.coordinates ??
    device.sample?.coordinates ??
    // Before the first fix the demo player stands at the route origin, so the
    // map is populated rather than empty.
    (decision?.kind === "SIMULATED" ? demoPlayerStart : null);

  const selectedMarker = useMemo(
    () => markers.find((marker) => marker.id === selectedMarkerId) ?? null,
    [markers, selectedMarkerId],
  );

  const selectedDistance = useMemo(() => {
    if (!selectedMarker || !playerPosition) return null;
    return distanceMeters(playerPosition, selectedMarker.coordinates);
  }, [playerPosition, selectedMarker]);

  const onTrack = useCallback(
    (marker: QuestMarker) => {
      setTrackedMarkerId(marker.id);
      setStartedDistance(
        playerPosition
          ? distanceMeters(playerPosition, marker.coordinates)
          : null,
      );
    },
    [playerPosition],
  );

  const onStopTracking = useCallback(() => {
    void session.stop();
    setTrackedMarkerId(null);
    setStartedDistance(null);
  }, [session]);

  // Starting the watch is a separate effect from selecting the quest, so the
  // session hook sees the questInstanceId before it opens a session for it.
  useEffect(() => {
    if (!trackedMarkerId || !provider) return;
    if (session.status !== "IDLE") return;
    void session.start();
  }, [provider, session, trackedMarkerId]);

  return (
    <ScreenFrame
      eyebrow={
        decision?.kind === "SIMULATED"
          ? "LIVE WORLD · SIMULATED LOCATION"
          : "LIVE WORLD"
      }
      title="SIDEQUEST"
    >
      <View style={[styles.mapWrap, { height: mapHeight }]}>
        <MapSurface
          config={config}
          markers={markers}
          nearbyAreaLabel={presence.snapshot?.clusterAreaLabel ?? ""}
          nearbyPartyCount={presence.snapshot?.nearbyCount ?? 0}
          onSelectMarker={setSelectedMarkerId}
          playerPosition={playerPosition}
          selectedMarkerId={selectedMarkerId}
        />
      </View>

      <View style={styles.sheet}>
        <PermissionGate
          availability={device.availability}
          onRequestBackground={() =>
            void device.requestPermission("BACKGROUND")
          }
          onRequestForeground={() =>
            void device.requestPermission("FOREGROUND")
          }
        />

        {session.rejection ? (
          <HudCard accessibilityLabel="Location reading was not accepted">
            <Text style={styles.rejectionTitle}>
              {session.rejection.retryable
                ? "⚠️ SIGNAL TROUBLE"
                : "⚠️ TRACKING STOPPED"}
            </Text>
            <Text style={styles.rejectionBody}>
              {session.rejection.message}
            </Text>
          </HudCard>
        ) : null}

        {device.error && !session.error ? (
          <HudCard accessibilityLabel="Location error">
            <Text style={styles.rejectionTitle}>⚠️ LOCATION UNAVAILABLE</Text>
            <Text style={styles.rejectionBody}>{device.error}</Text>
          </HudCard>
        ) : null}

        {session.error ? (
          <HudCard accessibilityLabel="Location error">
            <Text style={styles.rejectionTitle}>⚠️ OFFLINE</Text>
            <Text style={styles.rejectionBody}>{session.error}</Text>
          </HudCard>
        ) : null}

        <QuestDetailSheet
          arrival={
            trackedMarkerId === selectedMarkerId ? session.arrival : null
          }
          distanceMeters={selectedDistance}
          isTracking={
            session.isTracking && trackedMarkerId === selectedMarkerId
          }
          marker={selectedMarker}
          now={now}
          onStopTracking={onStopTracking}
          onTrack={onTrack}
          startedDistanceMeters={startedDistance}
        />

        <Pressable
          accessibilityLabel={
            showPrivacy
              ? "Hide location privacy controls"
              : "Show location privacy controls"
          }
          accessibilityRole="button"
          accessibilityState={{ expanded: showPrivacy }}
          onPress={() => setShowPrivacy((value) => !value)}
          style={({ pressed }) => [
            styles.privacyToggle,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.privacyToggleText}>
            {showPrivacy ? "▾ HIDE PRIVACY CONTROLS" : "▸ PRIVACY CONTROLS"}
          </Text>
        </Pressable>

        {showPrivacy ? (
          <LocationPrivacyControls
            activeSession={session.session}
            api={api}
            isTracking={session.isTracking}
            onPause={() => void session.pause()}
            onResume={() => void session.resume()}
            onStop={onStopTracking}
          />
        ) : null}

        {decision?.reason === "NATIVE_MODULE_MISSING" ? (
          <Text style={styles.footnote}>
            Running the deterministic location simulator: this runtime has no
            native location module. A development build uses real GPS.
          </Text>
        ) : null}
      </View>
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  // The map gets an explicit height and the page scrolls, rather than two flex
  // panes competing for a viewport whose height changes as browser chrome
  // shows and hides. Flex ratios plus minimums were what let the map paint
  // over the content below it at phone width.
  mapWrap: { width: "100%" },
  sheet: { gap: spacing.md, paddingBottom: spacing.xl },
  rejectionTitle: {
    color: colors.brandDeep,
    fontSize: typeScale.body,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  rejectionBody: { color: colors.muted, lineHeight: 21, marginTop: spacing.sm },
  privacyToggle: {
    alignItems: "center",
    borderColor: colors.brand,
    borderRadius: radii.sm,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 48,
  },
  privacyToggleText: {
    color: colors.brand,
    fontWeight: "900",
    letterSpacing: 1,
  },
  pressed: { opacity: 0.82 },
  footnote: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
  },
});
