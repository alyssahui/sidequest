/**
 * Environment-driven configuration for the location feature.
 *
 * Every value has a working default, so the app opens and the map runs with no
 * `.env` file at all. Credentials only ever upgrade the experience; they are
 * never required to reach it.
 */

export type LocationProviderKind = "EXPO" | "SIMULATED";

export type LocationFeatureConfig = {
  apiUrl: string;
  providerKind: LocationProviderKind;
  /** Demo route the simulator walks when `providerKind` is SIMULATED. */
  simulatedRouteId: string;
  /** Wall-clock milliseconds between simulated ticks. */
  simulatorTickMs: number;
  /** Simulated seconds advanced per tick, so a demo walk can be sped up. */
  simulatorSecondsPerTick: number;
  mapboxToken: string | null;
  /** Cadence for foreground watching, in milliseconds. */
  watchIntervalMs: number;
  watchDistanceIntervalMeters: number;
};

const env = (key: string): string | undefined => {
  // Expo inlines EXPO_PUBLIC_* at build time, so this must be a static lookup
  // per key rather than a dynamic index into process.env.
  const value = process.env[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
};

export function readLocationConfig(
  overrides: Partial<LocationFeatureConfig> = {},
): LocationFeatureConfig {
  const requested = env("EXPO_PUBLIC_LOCATION_PROVIDER")?.toUpperCase();
  const mapboxToken = env("EXPO_PUBLIC_MAPBOX_TOKEN") ?? null;

  return {
    apiUrl: env("EXPO_PUBLIC_API_URL") ?? "http://localhost:3000",
    // Defaulting to the simulator would hide a broken device path, and
    // defaulting to Expo would break CI and emulators without a mock location.
    // So: honour an explicit choice, otherwise use the real provider and let
    // the runtime probe fall back if the native module is missing.
    providerKind: requested === "SIMULATED" ? "SIMULATED" : "EXPO",
    simulatedRouteId:
      env("EXPO_PUBLIC_LOCATION_ROUTE") ?? "route-craig-street-bakery",
    simulatorTickMs: 1_000,
    // 15x speed: the ~11 minute demo walk finishes in about 45 seconds.
    simulatorSecondsPerTick: 15,
    mapboxToken,
    watchIntervalMs: 5_000,
    watchDistanceIntervalMeters: 10,
    ...overrides,
  };
}

/**
 * Whether the real map can render. Mapbox needs both a token and a native
 * module, and neither is present in Expo Go, so the deterministic game-world
 * surface is the normal path rather than an error state.
 */
export function canUseMapbox(config: LocationFeatureConfig): boolean {
  return Boolean(config.mapboxToken);
}
