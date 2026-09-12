import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";

import type {
  LocationAvailability,
  LocationPermissionLevel,
  LocationPermissionState,
  LocationSample,
} from "@sidequest/contracts/location";
import {
  capabilityFor,
  guidanceFor,
  type LocationProvider,
  type LocationSubscription,
} from "@sidequest/location";

export type DeviceLocationState = {
  availability: LocationAvailability | null;
  /** The player's own position, for drawing them on their own map. */
  sample: LocationSample | null;
  error: string | null;
  watching: boolean;
};

/**
 * The player's own position, for display only.
 *
 * This is deliberately separate from `useLocationSession`. Showing yourself on
 * your own map is not evidence and is nobody else's business: it opens no
 * server session, uploads nothing, and is never shared with the party. A
 * session is created only when the player chooses to track a quest.
 *
 * Keeping them separate also fixes the order of operations — the map can ask
 * for permission and show you where you are before any quest exists, rather
 * than waiting for a quest that needs your position to be useful in the first
 * place.
 */
export function useDeviceLocation({
  provider,
  intervalMs = 5_000,
  distanceIntervalMeters = 10,
}: {
  provider: LocationProvider | null;
  intervalMs?: number;
  distanceIntervalMeters?: number;
}) {
  const [state, setState] = useState<DeviceLocationState>({
    availability: null,
    sample: null,
    error: null,
    watching: false,
  });

  const subscriptionRef = useRef<LocationSubscription | null>(null);
  const mountedRef = useRef(true);
  // Guards against two watches racing when permission resolves mid-start.
  const startingRef = useRef(false);

  const patch = useCallback((next: Partial<DeviceLocationState>) => {
    if (!mountedRef.current) return;
    setState((current) => ({ ...current, ...next }));
  }, []);

  const stopWatch = useCallback(async () => {
    const subscription = subscriptionRef.current;
    subscriptionRef.current = null;
    if (subscription) await subscription.stop("REQUESTED");
    patch({ watching: false });
  }, [patch]);

  const startWatch = useCallback(async () => {
    if (!provider || subscriptionRef.current || startingRef.current) return;
    startingRef.current = true;

    try {
      // A display watch has no session, so it is bounded by a generous window
      // rather than a consent expiry. The provider still tears itself down at
      // this instant, so it can never run indefinitely.
      const expiresAt = new Date(Date.now() + 60 * 60_000).toISOString();

      subscriptionRef.current = await provider.watch(
        {
          sessionId: "device-display",
          mode: "FOREGROUND",
          intervalMs,
          distanceIntervalMeters,
          expiresAt,
        },
        (event) => {
          if (!mountedRef.current) return;
          switch (event.type) {
            case "SAMPLE":
              patch({ sample: event.sample, error: null, watching: true });
              break;
            case "AVAILABILITY":
              patch({ availability: event.availability });
              break;
            case "ERROR":
              patch({ error: event.error.message });
              break;
            case "STOPPED":
              subscriptionRef.current = null;
              patch({ watching: false });
              break;
          }
        },
      );
      patch({ watching: true });
    } catch (error) {
      patch({
        error:
          error instanceof Error
            ? error.message
            : "Couldn't read your location.",
      });
    } finally {
      startingRef.current = false;
    }
  }, [distanceIntervalMeters, intervalMs, patch, provider]);

  const refreshAvailability =
    useCallback(async (): Promise<LocationAvailability | null> => {
      if (!provider) return null;
      try {
        const availability = await provider.getAvailability();
        patch({ availability });
        return availability;
      } catch (error) {
        patch({
          error:
            error instanceof Error
              ? error.message
              : "Location is unavailable on this device.",
        });
        return null;
      }
    }, [patch, provider]);

  /** Shows the OS prompt, then starts watching if it was granted. */
  const requestPermission = useCallback(
    async (level: LocationPermissionLevel = "FOREGROUND") => {
      if (!provider) return;
      try {
        const granted: LocationPermissionState =
          await provider.requestPermission(level);

        // The request's own answer is authoritative. Re-querying here would
        // break Firefox, which keeps reporting "prompt" after a one-off allow.
        const service = state.availability?.service ??
          (await refreshAvailability())?.service ?? {
            servicesEnabled: true,
            backgroundSupported: false,
          };

        const availability: LocationAvailability = {
          permission: granted,
          service,
        };
        patch({ availability, error: null });

        if (capabilityFor(availability).canReadPosition) await startWatch();
      } catch (error) {
        patch({
          error:
            error instanceof Error
              ? error.message
              : "Location permission failed.",
        });
      }
    },
    [patch, provider, refreshAvailability, startWatch, state.availability],
  );

  /* ---------------------------------------------------------------- */

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      void subscriptionRef.current?.stop("REQUESTED");
      subscriptionRef.current = null;
    };
  }, []);

  // Probe on mount, and start watching straight away when permission already
  // exists, so a returning player sees themselves without pressing anything.
  useEffect(() => {
    if (!provider) return;
    void (async () => {
      const availability = await refreshAvailability();
      if (!availability) return;
      if (capabilityFor(availability).canReadPosition) await startWatch();
    })();
  }, [provider, refreshAvailability, startWatch]);

  // Permission can be granted or revoked in another tab or in Settings.
  useEffect(() => {
    const onChange = (next: AppStateStatus) => {
      if (next !== "active") return;
      void (async () => {
        const availability = await refreshAvailability();
        if (!availability) return;
        const canRead = capabilityFor(availability).canReadPosition;
        if (canRead) await startWatch();
        else await stopWatch();
      })();
    };

    const subscription = AppState.addEventListener("change", onChange);
    return () => subscription.remove();
  }, [refreshAvailability, startWatch, stopWatch]);

  const capability = useMemo(
    () => (state.availability ? capabilityFor(state.availability) : null),
    [state.availability],
  );

  const guidance = useMemo(
    () => (state.availability ? guidanceFor(state.availability) : null),
    [state.availability],
  );

  return {
    ...state,
    capability,
    guidance,
    requestPermission,
    refreshAvailability,
    stopWatch,
  };
}
