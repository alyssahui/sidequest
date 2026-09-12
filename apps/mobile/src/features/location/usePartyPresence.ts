import { useCallback, useEffect, useRef, useState } from "react";

import type { PartyPresenceSnapshot } from "@sidequest/contracts/location";

import type { LocationApi } from "./api";

export type PartyPresenceState = {
  snapshot: PartyPresenceSnapshot | null;
  loading: boolean;
  /** Set when presence could not be loaded; the map still renders without it. */
  error: string | null;
};

export type UsePartyPresenceOptions = {
  api: LocationApi;
  partyId: string | null;
  /** Polling cadence. The MVP polls; realtime can replace this later. */
  intervalMs?: number;
  enabled?: boolean;
};

/**
 * Polls coarse party presence.
 *
 * The response carries area labels and freshness only — never peer
 * coordinates — so there is nothing here to plot on a map at a real position,
 * by design.
 */
export function usePartyPresence({
  api,
  partyId,
  intervalMs = 30_000,
  enabled = true,
}: UsePartyPresenceOptions): PartyPresenceState & { refresh: () => void } {
  const [state, setState] = useState<PartyPresenceState>({
    snapshot: null,
    loading: false,
    error: null,
  });

  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    if (!partyId || !enabled) return;

    setState((current) => ({ ...current, loading: true }));
    try {
      const snapshot = await api.getPartyPresence(partyId);
      if (!mountedRef.current) return;
      setState({ snapshot, loading: false, error: null });
    } catch (error) {
      if (!mountedRef.current) return;
      // Presence is supplementary: a failure degrades the HUD, it does not
      // break the map.
      setState((current) => ({
        ...current,
        loading: false,
        error:
          error instanceof Error
            ? error.message
            : "Couldn't load party presence.",
      }));
    }
  }, [api, enabled, partyId]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!partyId || !enabled) return;

    void load();
    const timer = setInterval(() => void load(), intervalMs);
    return () => clearInterval(timer);
  }, [enabled, intervalMs, load, partyId]);

  return { ...state, refresh: () => void load() };
}
