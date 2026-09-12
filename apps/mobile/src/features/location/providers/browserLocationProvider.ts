import type {
  LocationAvailability,
  LocationPermissionLevel,
  LocationPermissionState,
  LocationSample,
} from "@sidequest/contracts/location";
import {
  LocationProviderError,
  type LocationProvider,
  type LocationSubscription,
  type LocationWatchListener,
  type LocationWatchOptions,
} from "@sidequest/location";

const GEO_TIMEOUT_MS = 15_000;
const GEO_MAXIMUM_AGE_MS = 30_000;

function asSample(position: GeolocationPosition): LocationSample {
  return {
    coordinates: {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    },
    accuracyMeters: position.coords.accuracy || 9_999,
    recordedAt: new Date(position.timestamp).toISOString(),
    source: "GPS",
    ...(position.coords.altitude === null
      ? {}
      : { altitudeMeters: position.coords.altitude }),
    ...(position.coords.speed === null || position.coords.speed < 0
      ? {}
      : { speedMps: position.coords.speed }),
  };
}

function browserError(error: GeolocationPositionError): LocationProviderError {
  if (error.code === error.PERMISSION_DENIED)
    return new LocationProviderError(
      "PERMISSION_DENIED",
      "Location permission was denied.",
    );
  if (error.code === error.TIMEOUT)
    return new LocationProviderError(
      "TIMEOUT",
      "Location is taking longer than usual. Move outdoors, then try again.",
      { retryable: true },
    );
  return new LocationProviderError(
    "SERVICES_DISABLED",
    "Your browser could not get a location fix. Check that device location services are on.",
    { retryable: true },
  );
}

/** Browser-only provider. Permission is queried before it is ever requested. */
export class BrowserLocationProvider implements LocationProvider {
  readonly id = "browser-geolocation";

  async getAvailability(): Promise<LocationAvailability> {
    if (
      typeof navigator === "undefined" ||
      !window.isSecureContext ||
      !navigator.geolocation
    ) {
      return {
        permission: "UNAVAILABLE",
        service: { servicesEnabled: false, backgroundSupported: false },
      };
    }
    let permission: LocationPermissionState = "NOT_REQUESTED";
    try {
      const result = await navigator.permissions?.query({
        name: "geolocation" as PermissionName,
      });
      permission =
        result?.state === "granted"
          ? "FOREGROUND"
          : result?.state === "denied"
            ? "DENIED"
            : "NOT_REQUESTED";
    } catch {
      // Safari does not consistently implement Permissions API. Do not prompt
      // during this probe; the click-triggered request below remains usable.
    }
    return {
      permission,
      service: { servicesEnabled: true, backgroundSupported: false },
    };
  }

  async requestPermission(
    _level: LocationPermissionLevel,
  ): Promise<LocationPermissionState> {
    const availability = await this.getAvailability();
    if (
      availability.permission === "UNAVAILABLE" ||
      availability.permission === "DENIED"
    )
      return availability.permission;
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        () => resolve("FOREGROUND"),
        (error) =>
          resolve(
            error.code === error.PERMISSION_DENIED ? "DENIED" : "NOT_REQUESTED",
          ),
        {
          enableHighAccuracy: true,
          timeout: GEO_TIMEOUT_MS,
          maximumAge: GEO_MAXIMUM_AGE_MS,
        },
      );
    });
  }

  async getCurrentSample(
    options: { timeoutMs?: number } = {},
  ): Promise<LocationSample> {
    if (!navigator.geolocation)
      throw new LocationProviderError(
        "MODULE_UNAVAILABLE",
        "Browser geolocation is unavailable.",
      );
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (position) => resolve(asSample(position)),
        (error) => reject(browserError(error)),
        {
          enableHighAccuracy: true,
          timeout: options.timeoutMs ?? GEO_TIMEOUT_MS,
          maximumAge: GEO_MAXIMUM_AGE_MS,
        },
      );
    });
  }

  async watch(
    options: LocationWatchOptions,
    listener: LocationWatchListener,
  ): Promise<LocationSubscription> {
    if (!navigator.geolocation)
      throw new LocationProviderError(
        "MODULE_UNAVAILABLE",
        "Browser geolocation is unavailable.",
      );
    let stopped = false;
    let lastAt = 0;
    const stop = async (
      reason: Parameters<LocationSubscription["stop"]>[0] = "REQUESTED",
    ) => {
      if (stopped) return;
      stopped = true;
      navigator.geolocation.clearWatch(watchId);
      clearTimeout(expiryTimer);
      listener({ type: "STOPPED", reason });
    };
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        if (Date.now() >= Date.parse(options.expiresAt))
          return void stop("EXPIRED");
        if (Date.now() - lastAt < options.intervalMs) return;
        lastAt = Date.now();
        listener({
          type: "SAMPLE",
          sample: {
            ...asSample(position),
            sessionId: options.sessionId,
            ...(options.questInstanceId
              ? { questInstanceId: options.questInstanceId }
              : {}),
          },
        });
      },
      (error) => listener({ type: "ERROR", error: browserError(error) }),
      {
        enableHighAccuracy: true,
        timeout: GEO_TIMEOUT_MS,
        maximumAge: GEO_MAXIMUM_AGE_MS,
      },
    );
    const expiryTimer = setTimeout(
      () => void stop("EXPIRED"),
      Math.max(0, Date.parse(options.expiresAt) - Date.now()),
    );
    return { sessionId: options.sessionId, stop };
  }
}
