import type {
  LocationAvailability,
  LocationPermissionLevel,
  LocationPermissionState,
  LocationSample,
  LocationServiceState,
  LocationSessionMode,
} from "@sidequest/contracts/location";

/**
 * Platform-independent location source.
 *
 * Declared here, in the framework-free package, so the domain, the tests, the
 * simulator, and the Expo implementation all agree on one shape and no consumer
 * needs to import Expo to be typed.
 */
export interface LocationProvider {
  readonly id: string;

  getAvailability(): Promise<LocationAvailability>;

  /**
   * Shows the OS dialog. Callers must explain the value first; this method
   * deliberately has no copy of its own.
   */
  requestPermission(
    level: LocationPermissionLevel,
  ): Promise<LocationPermissionState>;

  getCurrentSample(options?: { timeoutMs?: number }): Promise<LocationSample>;

  /** Starts a bounded watch. Always paired with the returned `stop`. */
  watch(
    options: LocationWatchOptions,
    listener: LocationWatchListener,
  ): Promise<LocationSubscription>;
}

export type LocationWatchOptions = {
  sessionId: string;
  mode: LocationSessionMode;
  /** Minimum interval between delivered samples. */
  intervalMs: number;
  /** Minimum movement before a new sample is delivered. */
  distanceIntervalMeters: number;
  questInstanceId?: string;
  /**
   * Hard stop for the watch. Providers must tear themselves down at this
   * instant even if `stop` is never called, so a crashed screen cannot leave
   * background collection running.
   */
  expiresAt: string;
};

export type LocationWatchEvent =
  | { type: "SAMPLE"; sample: LocationSample }
  | { type: "AVAILABILITY"; availability: LocationAvailability }
  | { type: "ERROR"; error: LocationProviderError }
  | { type: "STOPPED"; reason: LocationStopReason };

export type LocationWatchListener = (event: LocationWatchEvent) => void;

export type LocationSubscription = {
  sessionId: string;
  stop(reason?: LocationStopReason): Promise<void>;
};

export const locationStopReasons = [
  "REQUESTED",
  "EXPIRED",
  "PERMISSION_LOST",
  "SERVICES_DISABLED",
  "LOGOUT",
  "PROVIDER_ERROR",
] as const;

export type LocationStopReason = (typeof locationStopReasons)[number];

export const locationProviderErrorCodes = [
  "PERMISSION_DENIED",
  "SERVICES_DISABLED",
  "BACKGROUND_UNSUPPORTED",
  "MODULE_UNAVAILABLE",
  "TIMEOUT",
  "UNKNOWN",
] as const;

export type LocationProviderErrorCode =
  (typeof locationProviderErrorCodes)[number];

export class LocationProviderError extends Error {
  readonly code: LocationProviderErrorCode;
  readonly retryable: boolean;

  constructor(
    code: LocationProviderErrorCode,
    message: string,
    options?: { retryable?: boolean; cause?: unknown },
  ) {
    super(message, { cause: options?.cause });
    this.name = "LocationProviderError";
    this.code = code;
    this.retryable = options?.retryable ?? false;
  }
}

/**
 * Maps whatever the platform threw into one of our codes with actionable copy.
 * Native modules report failures inconsistently across SDK versions, so this
 * matches on message text as a fallback rather than trusting a single field.
 */
export function toProviderError(error: unknown): LocationProviderError {
  if (error instanceof LocationProviderError) return error;

  const raw = error as { code?: unknown; message?: unknown } | null;
  const code = typeof raw?.code === "string" ? raw.code : "";
  const message = typeof raw?.message === "string" ? raw.message : "";
  const haystack = `${code} ${message}`.toUpperCase();

  if (haystack.includes("DENIED") || haystack.includes("UNAUTHORIZED")) {
    return new LocationProviderError(
      "PERMISSION_DENIED",
      "Location permission was denied.",
    );
  }
  if (haystack.includes("SERVICES") || haystack.includes("DISABLED")) {
    return new LocationProviderError(
      "SERVICES_DISABLED",
      "Device location services are turned off.",
      { retryable: true },
    );
  }
  if (haystack.includes("BACKGROUND")) {
    return new LocationProviderError(
      "BACKGROUND_UNSUPPORTED",
      "This build can't run background location updates.",
    );
  }
  if (
    haystack.includes("NATIVE MODULE") ||
    haystack.includes("NOT AVAILABLE") ||
    haystack.includes("UNIMPLEMENTED")
  ) {
    return new LocationProviderError(
      "MODULE_UNAVAILABLE",
      "The location module isn't available in this runtime.",
    );
  }
  if (haystack.includes("TIMEOUT") || haystack.includes("TIMED OUT")) {
    return new LocationProviderError(
      "TIMEOUT",
      "Couldn't get a location fix in time. Try again outdoors.",
      { retryable: true },
    );
  }

  return new LocationProviderError(
    "UNKNOWN",
    "Location is unavailable right now.",
    { retryable: true, cause: error },
  );
}

export const unavailableService: LocationServiceState = {
  servicesEnabled: false,
  backgroundSupported: false,
};
