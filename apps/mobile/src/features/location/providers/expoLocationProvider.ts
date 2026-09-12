import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";

import type {
  LocationAvailability,
  LocationPermissionLevel,
  LocationPermissionState,
  LocationSample,
} from "@sidequest/contracts/location";
import {
  LocationProviderError,
  toProviderError,
  type LocationProvider,
  type LocationSubscription,
  type LocationWatchListener,
  type LocationWatchOptions,
} from "@sidequest/location";

/**
 * Registered task name for background updates.
 *
 * Must match between `defineTask` and `startLocationUpdatesAsync`, and must be
 * defined at module scope so the OS can restore it after the app is killed.
 */
export const BACKGROUND_LOCATION_TASK = "sidequest-active-quest-location";

type BackgroundListener = (samples: LocationSample[]) => void;

/**
 * Background samples arrive in a task the OS may invoke with no React tree
 * mounted, so they land here first and are drained by whichever session is
 * listening. If nothing is listening the samples are dropped rather than
 * queued indefinitely: stale positions are not worth storing.
 */
const backgroundListeners = new Set<BackgroundListener>();

export function onBackgroundSamples(listener: BackgroundListener): () => void {
  backgroundListeners.add(listener);
  return () => backgroundListeners.delete(listener);
}

function toSample(
  position: Location.LocationObject,
  source: LocationSample["source"] = "GPS",
): LocationSample {
  const sample: LocationSample = {
    coordinates: {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    },
    // A missing accuracy is treated as very poor rather than perfect, so an
    // unknown fix can never satisfy an arrival radius by omission.
    accuracyMeters: position.coords.accuracy ?? 9_999,
    recordedAt: new Date(position.timestamp).toISOString(),
    source,
  };
  if (typeof position.coords.altitude === "number") {
    sample.altitudeMeters = position.coords.altitude;
  }
  if (typeof position.coords.speed === "number" && position.coords.speed >= 0) {
    sample.speedMps = position.coords.speed;
  }
  return sample;
}

// Defining the task at module scope is required: Expo re-registers it on cold
// start, and a task defined inside a component would not exist then.
try {
  if (!TaskManager.isTaskDefined(BACKGROUND_LOCATION_TASK)) {
    TaskManager.defineTask(
      BACKGROUND_LOCATION_TASK,
      async ({ data, error }) => {
        if (error) return;
        const locations = (data as { locations?: Location.LocationObject[] })
          ?.locations;
        if (!locations?.length) return;

        const samples = locations.map((position) => toSample(position));
        for (const listener of backgroundListeners) listener(samples);
      },
    );
  }
} catch {
  // No native module (Expo Go web, a unit-test runtime). Foreground still works.
}

function mapPermission(
  response: Location.LocationPermissionResponse | undefined,
  background: boolean,
): LocationPermissionState {
  if (!response) return "NOT_REQUESTED";
  if (response.status === Location.PermissionStatus.UNDETERMINED) {
    return "NOT_REQUESTED";
  }
  if (!response.granted) return "DENIED";

  // iOS reduced accuracy and Android COARSE both mean "an area, not a point":
  // useful for discovery, not good enough to prove arrival.
  if (
    response.ios?.accuracy === "reduced" ||
    response.android?.accuracy === "coarse"
  ) {
    return "APPROXIMATE";
  }

  return background ? "BACKGROUND" : "FOREGROUND";
}

export type ExpoProviderOptions = {
  /** Overridden in tests; defaults to the real module. */
  locationModule?: typeof Location;
};

/**
 * Real device location, backed by Expo Location and Task Manager.
 *
 * Background updates require a development build with the matching
 * entitlements: Expo Go cannot run them. The provider reports that through
 * `backgroundSupported` rather than failing, so foreground-only stays a fully
 * working mode.
 */
export class ExpoLocationProvider implements LocationProvider {
  readonly id = "expo";

  readonly #location: typeof Location;
  readonly #watchers = new Map<string, Location.LocationSubscription>();
  readonly #backgroundSessions = new Set<string>();

  constructor(options: ExpoProviderOptions = {}) {
    this.#location = options.locationModule ?? Location;
  }

  async getAvailability(): Promise<LocationAvailability> {
    try {
      const [foreground, background, servicesEnabled] = await Promise.all([
        this.#location.getForegroundPermissionsAsync(),
        this.#location.getBackgroundPermissionsAsync().catch(() => undefined),
        this.#location.hasServicesEnabledAsync().catch(() => false),
      ]);

      const backgroundGranted = background?.granted === true;
      const permission = backgroundGranted
        ? mapPermission(foreground, true)
        : mapPermission(foreground, false);

      return {
        permission,
        service: {
          servicesEnabled,
          backgroundSupported: await this.#supportsBackground(),
        },
      };
    } catch (error) {
      const mapped = toProviderError(error);
      // A missing native module is a capability fact, not a crash: report it as
      // unavailable so the UI shows the honest "not on this device" state.
      if (mapped.code === "MODULE_UNAVAILABLE") {
        return {
          permission: "UNAVAILABLE",
          service: { servicesEnabled: false, backgroundSupported: false },
        };
      }
      throw mapped;
    }
  }

  async #supportsBackground(): Promise<boolean> {
    try {
      return await TaskManager.isAvailableAsync();
    } catch {
      return false;
    }
  }

  async requestPermission(
    level: LocationPermissionLevel,
  ): Promise<LocationPermissionState> {
    try {
      const foreground =
        await this.#location.requestForegroundPermissionsAsync();
      if (!foreground.granted) return mapPermission(foreground, false);

      if (level === "FOREGROUND") return mapPermission(foreground, false);

      // Background is always requested *after* foreground is granted; asking
      // for it first is rejected outright on both platforms.
      const background =
        await this.#location.requestBackgroundPermissionsAsync();
      return mapPermission(foreground, background.granted);
    } catch (error) {
      throw toProviderError(error);
    }
  }

  async getCurrentSample(
    options: { timeoutMs?: number } = {},
  ): Promise<LocationSample> {
    try {
      const position = await this.#location.getCurrentPositionAsync({
        accuracy: this.#location.Accuracy.High,
      });
      return toSample(position);
    } catch (error) {
      const mapped = toProviderError(error);
      if (options.timeoutMs && mapped.code === "UNKNOWN") {
        throw new LocationProviderError(
          "TIMEOUT",
          "Couldn't get a location fix in time. Try again outdoors.",
          { retryable: true },
        );
      }
      throw mapped;
    }
  }

  async watch(
    options: LocationWatchOptions,
    listener: LocationWatchListener,
  ): Promise<LocationSubscription> {
    const expiresAtMs = Date.parse(options.expiresAt);

    const stop = async (
      reason: Parameters<LocationSubscription["stop"]>[0] = "REQUESTED",
    ) => {
      const watcher = this.#watchers.get(options.sessionId);
      if (watcher) {
        watcher.remove();
        this.#watchers.delete(options.sessionId);
      }

      if (this.#backgroundSessions.delete(options.sessionId)) {
        // Best effort: if the task was never started, stopping it throws and
        // there is nothing useful to do about it.
        await this.#location
          .stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK)
          .catch(() => undefined);
      }

      listener({ type: "STOPPED", reason });
    };

    const deliver = (position: Location.LocationObject) => {
      if (Date.now() >= expiresAtMs) {
        void stop("EXPIRED");
        return;
      }
      listener({
        type: "SAMPLE",
        sample: {
          ...toSample(position),
          sessionId: options.sessionId,
          ...(options.questInstanceId
            ? { questInstanceId: options.questInstanceId }
            : {}),
        },
      });
    };

    try {
      const watcher = await this.#location.watchPositionAsync(
        {
          accuracy: this.#location.Accuracy.High,
          timeInterval: options.intervalMs,
          distanceInterval: options.distanceIntervalMeters,
        },
        deliver,
      );
      this.#watchers.set(options.sessionId, watcher);
    } catch (error) {
      const mapped = toProviderError(error);
      listener({ type: "ERROR", error: mapped });
      throw mapped;
    }

    if (options.mode === "BACKGROUND") {
      await this.#startBackground(options, listener);
    }

    return { sessionId: options.sessionId, stop };
  }

  async #startBackground(
    options: LocationWatchOptions,
    listener: LocationWatchListener,
  ) {
    try {
      await this.#location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
        accuracy: this.#location.Accuracy.Balanced,
        timeInterval: options.intervalMs,
        distanceInterval: options.distanceIntervalMeters,
        // The OS notification is not optional on Android, and it is the right
        // thing on principle: the player can always see that a quest is
        // tracking and can stop it from there.
        foregroundService: {
          notificationTitle: "SideQuest is tracking your quest",
          notificationBody:
            "Location is on until this quest ends. Tap to pause it.",
          notificationColor: "#FF9A55",
        },
        pausesUpdatesAutomatically: true,
        showsBackgroundLocationIndicator: true,
      });
      this.#backgroundSessions.add(options.sessionId);
    } catch (error) {
      // Falling back to foreground-only is strictly better than failing the
      // whole session: the quest still verifies while the app is open.
      listener({ type: "ERROR", error: toProviderError(error) });
    }
  }
}
