import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";

import type {
  ArrivalEvaluation,
  GpsRequirement,
  LocationAvailability,
  LocationPermissionLevel,
  LocationPermissionState,
  LocationRejection,
  LocationSample,
  LocationSession,
  LocationSessionPurpose,
} from "@sidequest/contracts/location";
import {
  capabilityFor,
  defaultLocationPolicy,
  evaluateArrival,
  guidanceFor,
  type LocationProvider,
  type LocationSubscription,
} from "@sidequest/location";

import type { LocationApi } from "./api";
import type { LocationFeatureConfig } from "./config";

export type LocationSessionStatus =
  | "IDLE"
  | "REQUESTING_PERMISSION"
  | "STARTING"
  | "TRACKING"
  | "PAUSED"
  | "STOPPED"
  | "ERROR";

export type LocationSessionState = {
  status: LocationSessionStatus;
  availability: LocationAvailability | null;
  session: LocationSession | null;
  /** The player's own most recent fix. Never shared with the party. */
  sample: LocationSample | null;
  /** Live arrival evaluation against `requirement`, when one is supplied. */
  arrival: ArrivalEvaluation | null;
  /** Last server rejection, so the UI can explain a retryable failure. */
  rejection: LocationRejection | null;
  error: string | null;
  acceptedSampleCount: number;
};

export type UseLocationSessionOptions = {
  api: LocationApi;
  config: LocationFeatureConfig;
  /** Resolved once by the caller; swapping providers restarts the session. */
  provider: LocationProvider | null;
  purpose: LocationSessionPurpose;
  questInstanceId?: string;
  partyId?: string;
  /** Live arrival feedback target. */
  requirement?: GpsRequirement;
  /** Requested session length; the server clamps it. */
  durationMs?: number;
  /** Ask for background updates. Downgraded silently if not permitted. */
  preferBackground?: boolean;
};

const initialState: LocationSessionState = {
  status: "IDLE",
  availability: null,
  session: null,
  sample: null,
  arrival: null,
  rejection: null,
  error: null,
  acceptedSampleCount: 0,
};

/**
 * Owns one location session end to end: permission, server session, the
 * provider watch, upload, and teardown.
 *
 * Teardown is the part that matters most. The subscription is stopped when the
 * session expires, when the screen unmounts, when the session is stopped or
 * paused, and when the provider reports the permission was revoked — so there
 * is no path that leaves location collection running after the reason for it
 * has gone.
 */
export function useLocationSession(options: UseLocationSessionOptions) {
  const {
    api,
    config,
    provider,
    purpose,
    questInstanceId,
    partyId,
    requirement,
    durationMs,
    preferBackground = false,
  } = options;

  const [state, setState] = useState<LocationSessionState>(initialState);

  const subscriptionRef = useRef<LocationSubscription | null>(null);
  const sessionRef = useRef<LocationSession | null>(null);
  const uploadSeqRef = useRef(0);
  // Guards every async continuation: after unmount, nothing may set state or
  // start a watch.
  const mountedRef = useRef(true);

  const patch = useCallback((next: Partial<LocationSessionState>) => {
    if (!mountedRef.current) return;
    setState((current) => ({ ...current, ...next }));
  }, []);

  const refreshAvailability = useCallback(async () => {
    if (!provider) return null;
    try {
      const availability = await provider.getAvailability();
      patch({ availability });
      return availability;
    } catch (error) {
      patch({
        status: "ERROR",
        error:
          error instanceof Error ? error.message : "Location is unavailable.",
      });
      return null;
    }
  }, [provider, patch]);

  const teardown = useCallback(async () => {
    const subscription = subscriptionRef.current;
    subscriptionRef.current = null;
    if (subscription) await subscription.stop("REQUESTED");
  }, []);

  /* ---------------------------------------------------------------- */
  /* Upload                                                            */
  /* ---------------------------------------------------------------- */

  const uploadSample = useCallback(
    async (sample: LocationSample) => {
      const session = sessionRef.current;
      if (!session) return;

      uploadSeqRef.current += 1;
      // A stable key per reading makes a network retry a no-op server-side.
      const idempotencyKey = `${session.id}:${uploadSeqRef.current}`;

      try {
        const result = await api.submitSample(
          session.id,
          sample,
          idempotencyKey,
        );

        if (!mountedRef.current) return;

        if (result.accepted) {
          setState((current) => ({
            ...current,
            rejection: null,
            acceptedSampleCount: result.duplicate
              ? current.acceptedSampleCount
              : current.acceptedSampleCount + 1,
          }));
          return;
        }

        // A non-retryable rejection means the session itself is finished, so
        // the watch stops rather than uploading into a closed session.
        if (!result.rejection.retryable) {
          await teardown();
          patch({ status: "STOPPED", rejection: result.rejection });
          return;
        }

        patch({ rejection: result.rejection });
      } catch (error) {
        // Offline is expected on a walk. Keep watching; the next fix retries.
        patch({
          error:
            error instanceof Error
              ? error.message
              : "Couldn't reach SideQuest. Still tracking locally.",
        });
      }
    },
    [api, patch, teardown],
  );

  /* ---------------------------------------------------------------- */
  /* Start                                                             */
  /* ---------------------------------------------------------------- */

  const start = useCallback(async () => {
    if (!provider) {
      patch({ status: "ERROR", error: "No location provider is available." });
      return;
    }
    if (subscriptionRef.current) return;

    patch({ status: "REQUESTING_PERMISSION", error: null, rejection: null });

    let availability = await refreshAvailability();
    if (!availability) return;

    let capability = capabilityFor(availability);

    if (capability.nextRequest) {
      const level: LocationPermissionLevel =
        preferBackground && capability.nextRequest === "BACKGROUND"
          ? "BACKGROUND"
          : "FOREGROUND";
      let granted: LocationPermissionState;
      try {
        granted = await provider.requestPermission(level);
      } catch (error) {
        patch({
          status: "ERROR",
          error:
            error instanceof Error
              ? error.message
              : "Location permission failed.",
        });
        return;
      }

      // Trust what the request returned rather than re-querying.
      //
      // Firefox reports `navigator.permissions.query({name:'geolocation'})` as
      // "prompt" indefinitely unless the user ticks "Remember this decision",
      // so a re-read right after a successful grant comes back as
      // NOT_REQUESTED and the session would bail out before it ever started
      // watching. The request's own answer is the authoritative one.
      availability = { permission: granted, service: availability.service };
      patch({ availability });
      capability = capabilityFor(availability);
    }

    if (!capability.canReadPosition) {
      // Not an error: it is a state with its own guidance and a way forward.
      patch({ status: "IDLE", error: null });
      return;
    }

    patch({ status: "STARTING" });

    let session: LocationSession;
    try {
      session = await api.startSession({
        purpose,
        mode:
          preferBackground && capability.canRunBackground
            ? "BACKGROUND"
            : "FOREGROUND",
        ...(durationMs === undefined ? {} : { durationMs }),
        ...(questInstanceId ? { questInstanceId } : {}),
        ...(partyId ? { partyId } : {}),
      });
    } catch (error) {
      patch({
        status: "ERROR",
        error:
          error instanceof Error
            ? error.message
            : "Couldn't start a location session.",
      });
      return;
    }

    if (!mountedRef.current) {
      // Unmounted mid-start: stop the session we just created rather than
      // leaving it running server-side.
      await api.stopSession(session.id).catch(() => undefined);
      return;
    }

    sessionRef.current = session;
    uploadSeqRef.current = 0;
    patch({ session, status: "TRACKING" });

    try {
      subscriptionRef.current = await provider.watch(
        {
          sessionId: session.id,
          mode: session.mode,
          intervalMs: config.watchIntervalMs,
          distanceIntervalMeters: config.watchDistanceIntervalMeters,
          expiresAt: session.expiresAt,
          ...(questInstanceId ? { questInstanceId } : {}),
        },
        (event) => {
          if (!mountedRef.current) return;

          switch (event.type) {
            case "SAMPLE": {
              patch({ sample: event.sample });
              void uploadSample(event.sample);
              break;
            }
            case "AVAILABILITY": {
              patch({ availability: event.availability });
              break;
            }
            case "ERROR": {
              patch({ error: event.error.message });
              break;
            }
            case "STOPPED": {
              subscriptionRef.current = null;
              patch({
                status: event.reason === "EXPIRED" ? "STOPPED" : "PAUSED",
              });
              break;
            }
          }
        },
      );
    } catch (error) {
      patch({
        status: "ERROR",
        error:
          error instanceof Error ? error.message : "Couldn't start tracking.",
      });
    }
  }, [
    api,
    config.watchDistanceIntervalMeters,
    config.watchIntervalMs,
    durationMs,
    partyId,
    patch,
    preferBackground,
    provider,
    purpose,
    questInstanceId,
    refreshAvailability,
    uploadSample,
  ]);

  /* ---------------------------------------------------------------- */
  /* Pause, resume, stop                                               */
  /* ---------------------------------------------------------------- */

  const pause = useCallback(async () => {
    const session = sessionRef.current;
    if (!session) return;
    await teardown();
    const updated = await api.pauseSession(session.id).catch(() => null);
    sessionRef.current = updated ?? session;
    patch({ status: "PAUSED", ...(updated ? { session: updated } : {}) });
  }, [api, patch, teardown]);

  const resume = useCallback(async () => {
    const session = sessionRef.current;
    if (!session) {
      await start();
      return;
    }
    const updated = await api.resumeSession(session.id).catch(() => null);
    if (updated) {
      sessionRef.current = updated;
      patch({ session: updated });
    }
    // The provider watch does not survive a pause, so it is restarted here.
    sessionRef.current = null;
    await start();
  }, [api, patch, start]);

  const stop = useCallback(async () => {
    const session = sessionRef.current;
    await teardown();
    sessionRef.current = null;
    if (session) await api.stopSession(session.id).catch(() => undefined);
    patch({ status: "STOPPED", session: null });
  }, [api, patch, teardown]);

  /* ---------------------------------------------------------------- */
  /* Lifecycle                                                         */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      // Fire-and-forget is correct here: the component is already gone, and the
      // provider teardown must not be awaited inside a cleanup function.
      void subscriptionRef.current?.stop("REQUESTED");
      subscriptionRef.current = null;

      const session = sessionRef.current;
      sessionRef.current = null;
      if (session) void api.stopSession(session.id).catch(() => undefined);
    };
  }, [api]);

  // Re-check permission when the app returns from the background: the player
  // may have revoked it in Settings while away.
  useEffect(() => {
    const onChange = (next: AppStateStatus) => {
      if (next !== "active") return;
      void (async () => {
        const availability = await refreshAvailability();
        if (!availability) return;
        if (
          subscriptionRef.current &&
          !capabilityFor(availability).canReadPosition
        ) {
          await teardown();
          patch({ status: "PAUSED" });
        }
      })();
    };

    const subscription = AppState.addEventListener("change", onChange);
    return () => subscription.remove();
  }, [patch, refreshAvailability, teardown]);

  useEffect(() => {
    void refreshAvailability();
  }, [refreshAvailability]);

  /* ---------------------------------------------------------------- */
  /* Derived                                                           */
  /* ---------------------------------------------------------------- */

  // Arrival is recomputed locally for instant HUD feedback. The server's own
  // evaluation remains the only one that counts as evidence.
  const arrival = useMemo(() => {
    if (!requirement || !state.sample) return null;
    return evaluateArrival({
      sample: state.sample,
      requirement,
      now: Date.now(),
      policy: defaultLocationPolicy.arrival,
    });
  }, [requirement, state.sample]);

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
    arrival,
    capability,
    guidance,
    isTracking: state.status === "TRACKING",
    start,
    pause,
    resume,
    stop,
    refreshAvailability,
  };
}
