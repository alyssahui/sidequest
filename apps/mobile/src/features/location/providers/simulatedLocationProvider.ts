import type {
  LocationAvailability,
  LocationPermissionLevel,
  LocationPermissionState,
  LocationSample,
} from "@sidequest/contracts/location";
import {
  LocationSimulator,
  findDemoRoute,
  type LocationProvider,
  type LocationSubscription,
  type LocationWatchListener,
  type LocationWatchOptions,
  type SimulatedRoute,
} from "@sidequest/location";

export type SimulatedProviderOptions = {
  route: SimulatedRoute;
  /** Wall-clock milliseconds between ticks. */
  tickMs?: number;
  /** Simulated seconds advanced per tick, so a demo walk can be sped up. */
  secondsPerTick?: number;
  /** Permission state to report; lets the demo show denied/approximate states. */
  permission?: LocationPermissionState;
  servicesEnabled?: boolean;
  /** Injectable timer and clock so tests need no wall-clock waiting. */
  setIntervalImpl?: typeof setInterval;
  clearIntervalImpl?: typeof clearInterval;
  now?: () => number;
};

/**
 * Deterministic location source for emulators, CI, and tokenless demo mode.
 *
 * It walks a scripted route at a fixed rate, so the same demo produces the
 * same trace every time. This is what lets the GPS quest be shown end to end
 * on a laptop with no device, no Mapbox token, and no database.
 */
export class SimulatedLocationProvider implements LocationProvider {
  readonly id = "simulated";

  readonly #simulator: LocationSimulator;
  readonly #tickMs: number;
  readonly #secondsPerTick: number;
  readonly #setInterval: typeof setInterval;
  readonly #clearInterval: typeof clearInterval;
  readonly #subscriptions = new Map<string, ReturnType<typeof setInterval>>();

  #permission: LocationPermissionState;
  #servicesEnabled: boolean;

  constructor(options: SimulatedProviderOptions) {
    this.#simulator = new LocationSimulator({
      route: options.route,
      startedAt: options.now?.() ?? Date.now(),
    });
    this.#tickMs = options.tickMs ?? 1_000;
    this.#secondsPerTick = options.secondsPerTick ?? 1;
    this.#permission = options.permission ?? "FOREGROUND";
    this.#servicesEnabled = options.servicesEnabled ?? true;
    this.#setInterval = options.setIntervalImpl ?? setInterval;
    this.#clearInterval = options.clearIntervalImpl ?? clearInterval;
  }

  get simulator(): LocationSimulator {
    return this.#simulator;
  }

  /** Demo control: force a permission state to show that UI branch. */
  setPermission(state: LocationPermissionState): void {
    this.#permission = state;
  }

  setServicesEnabled(enabled: boolean): void {
    this.#servicesEnabled = enabled;
  }

  async getAvailability(): Promise<LocationAvailability> {
    return {
      permission: this.#permission,
      service: {
        servicesEnabled: this.#servicesEnabled,
        // The simulator can pretend to run in the background because nothing
        // native is involved.
        backgroundSupported: true,
      },
    };
  }

  async requestPermission(
    level: LocationPermissionLevel,
  ): Promise<LocationPermissionState> {
    if (this.#permission === "DENIED" || this.#permission === "UNAVAILABLE") {
      return this.#permission;
    }
    this.#permission = level === "BACKGROUND" ? "BACKGROUND" : "FOREGROUND";
    return this.#permission;
  }

  async getCurrentSample(): Promise<LocationSample> {
    return this.#simulator.current();
  }

  async watch(
    options: LocationWatchOptions,
    listener: LocationWatchListener,
  ): Promise<LocationSubscription> {
    const expiresAtMs = Date.parse(options.expiresAt);

    const stop = async (
      reason: Parameters<LocationSubscription["stop"]>[0] = "REQUESTED",
    ) => {
      const timer = this.#subscriptions.get(options.sessionId);
      if (!timer) return;
      this.#clearInterval(timer);
      this.#subscriptions.delete(options.sessionId);
      listener({ type: "STOPPED", reason });
    };

    const timer = this.#setInterval(() => {
      // The hard expiry is honoured by the provider itself, so a crashed screen
      // cannot leave the walk running forever.
      if (Date.now() >= expiresAtMs) {
        void stop("EXPIRED");
        return;
      }

      const sample = this.#simulator.advance(this.#secondsPerTick * 1_000);
      listener({
        type: "SAMPLE",
        sample: {
          ...sample,
          sessionId: options.sessionId,
          ...(options.questInstanceId
            ? { questInstanceId: options.questInstanceId }
            : {}),
        },
      });
    }, this.#tickMs);

    this.#subscriptions.set(options.sessionId, timer);

    // Emit one sample immediately so the map is never blank while waiting for
    // the first tick.
    listener({
      type: "SAMPLE",
      sample: {
        ...this.#simulator.current(),
        sessionId: options.sessionId,
        ...(options.questInstanceId
          ? { questInstanceId: options.questInstanceId }
          : {}),
      },
    });

    return { sessionId: options.sessionId, stop };
  }
}

export function createSimulatedProvider(
  routeId: string,
  options: Omit<SimulatedProviderOptions, "route"> = {},
): SimulatedLocationProvider {
  const route = findDemoRoute(routeId);
  if (!route) {
    throw new Error(
      `Unknown demo route "${routeId}". See demoRoutes in @sidequest/location.`,
    );
  }
  return new SimulatedLocationProvider({ route, ...options });
}
