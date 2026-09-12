import type { LocationProvider } from "@sidequest/location";

import type { LocationFeatureConfig, LocationProviderKind } from "../config";
import { createSimulatedProvider } from "./simulatedLocationProvider";
import { BrowserLocationProvider } from "./browserLocationProvider";

export type ProviderDecision = {
  kind: LocationProviderKind;
  reason:
    | "CONFIGURED_SIMULATED"
    | "CONFIGURED_EXPO"
    | "CONFIGURED_BROWSER"
    | "NATIVE_MODULE_MISSING";
};

/**
 * Pure decision, separated from the loading so it can be tested without
 * importing Expo. `nativeAvailable` is probed by the caller.
 */
export function chooseProvider(
  config: Pick<LocationFeatureConfig, "providerKind">,
  nativeAvailable: boolean,
): ProviderDecision {
  if (config.providerKind === "SIMULATED") {
    return { kind: "SIMULATED", reason: "CONFIGURED_SIMULATED" };
  }
  if (config.providerKind === "BROWSER") {
    return { kind: "BROWSER", reason: "CONFIGURED_BROWSER" };
  }
  // Falling back rather than failing is what keeps the app openable on a web
  // preview, in a bare emulator, and in CI.
  if (!nativeAvailable) {
    return { kind: "SIMULATED", reason: "NATIVE_MODULE_MISSING" };
  }
  return { kind: "EXPO", reason: "CONFIGURED_EXPO" };
}

export type SelectedProvider = {
  provider: LocationProvider;
  decision: ProviderDecision;
};

/**
 * Builds the location provider for this runtime.
 *
 * The Expo provider is imported dynamically so that a runtime without the
 * native module — CI, a plain Node test, a web preview — never loads it at all
 * and falls through to the deterministic simulator instead.
 */
export async function selectLocationProvider(
  config: LocationFeatureConfig,
): Promise<SelectedProvider> {
  if (config.providerKind === "SIMULATED") {
    return {
      provider: createSimulatedProvider(config.simulatedRouteId, {
        tickMs: config.simulatorTickMs,
        secondsPerTick: config.simulatorSecondsPerTick,
      }),
      decision: chooseProvider(config, true),
    };
  }
  if (config.providerKind === "BROWSER") {
    const provider = new BrowserLocationProvider();
    const availability = await provider.getAvailability();
    if (availability.permission !== "UNAVAILABLE") {
      return { provider, decision: chooseProvider(config, true) };
    }
    return {
      provider: createSimulatedProvider(config.simulatedRouteId, {
        tickMs: config.simulatorTickMs,
        secondsPerTick: config.simulatorSecondsPerTick,
      }),
      decision: { kind: "SIMULATED", reason: "NATIVE_MODULE_MISSING" },
    };
  }

  try {
    const { ExpoLocationProvider } = await import("./expoLocationProvider");
    const provider = new ExpoLocationProvider();

    // Probe rather than assume: the module can import successfully and still
    // have no native backing, which is exactly the Expo Go web case.
    const availability = await provider.getAvailability();
    if (availability.permission === "UNAVAILABLE") {
      throw new Error("Location native module unavailable");
    }

    return { provider, decision: chooseProvider(config, true) };
  } catch {
    return {
      provider: createSimulatedProvider(config.simulatedRouteId, {
        tickMs: config.simulatorTickMs,
        secondsPerTick: config.simulatorSecondsPerTick,
      }),
      decision: { kind: "SIMULATED", reason: "NATIVE_MODULE_MISSING" },
    };
  }
}

export {
  SimulatedLocationProvider,
  createSimulatedProvider,
} from "./simulatedLocationProvider";
