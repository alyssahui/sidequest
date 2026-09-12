import type {
  LocationAvailability,
  LocationPermissionLevel,
  LocationPermissionState,
  LocationSessionMode,
} from "@sidequest/contracts/location";

/**
 * What the player can actually do right now, and what the UI should say about
 * it. Every branch is reachable: a denied permission, reduced accuracy, a
 * device with location services switched off, and a build without background
 * support are all normal states rather than errors.
 */
export type LocationCapability = {
  /** Can we read any position at all? */
  canReadPosition: boolean;
  /** Can we run an active-quest session in the background? */
  canRunBackground: boolean;
  /** Is the fix precise enough for GPS verification? */
  canVerifyArrival: boolean;
  /** Highest session mode currently possible. */
  bestAvailableMode: LocationSessionMode | null;
  /** The next permission worth asking for, if any. */
  nextRequest: LocationPermissionLevel | null;
};

export function capabilityFor(
  availability: LocationAvailability,
): LocationCapability {
  const { permission, service } = availability;

  if (permission === "UNAVAILABLE") {
    return {
      canReadPosition: false,
      canRunBackground: false,
      canVerifyArrival: false,
      bestAvailableMode: null,
      nextRequest: null,
    };
  }

  if (permission === "NOT_REQUESTED") {
    return {
      canReadPosition: false,
      canRunBackground: false,
      canVerifyArrival: false,
      bestAvailableMode: null,
      nextRequest: "FOREGROUND",
    };
  }

  if (permission === "DENIED") {
    return {
      canReadPosition: false,
      canRunBackground: false,
      canVerifyArrival: false,
      bestAvailableMode: null,
      // The OS will not show the dialog again; the UI must deep-link Settings.
      nextRequest: null,
    };
  }

  if (!service.servicesEnabled) {
    return {
      canReadPosition: false,
      canRunBackground: false,
      canVerifyArrival: false,
      bestAvailableMode: null,
      nextRequest: null,
    };
  }

  if (permission === "APPROXIMATE") {
    // Approximate location still powers discovery and coarse presence; it just
    // cannot satisfy an arrival radius. Foreground-only stays useful.
    return {
      canReadPosition: true,
      canRunBackground: false,
      canVerifyArrival: false,
      bestAvailableMode: "FOREGROUND",
      nextRequest: "FOREGROUND",
    };
  }

  if (permission === "FOREGROUND") {
    return {
      canReadPosition: true,
      canRunBackground: false,
      canVerifyArrival: true,
      bestAvailableMode: "FOREGROUND",
      nextRequest: service.backgroundSupported ? "BACKGROUND" : null,
    };
  }

  return {
    canReadPosition: true,
    canRunBackground: service.backgroundSupported,
    canVerifyArrival: true,
    bestAvailableMode: service.backgroundSupported
      ? "BACKGROUND"
      : "FOREGROUND",
    nextRequest: null,
  };
}

export type PermissionGuidance = {
  title: string;
  body: string;
  /** Primary action label, or null when there is nothing to press. */
  actionLabel: string | null;
  action:
    "REQUEST_FOREGROUND" | "REQUEST_BACKGROUND" | "OPEN_SETTINGS" | "NONE";
  /** True when the experience still works, just with less precision. */
  degraded: boolean;
};

/**
 * Copy is written to explain the value before the OS dialog appears, and to
 * offer a real next step in every failure state rather than a dead end.
 */
export function guidanceFor(
  availability: LocationAvailability,
): PermissionGuidance {
  const { permission, service } = availability;

  if (permission === "UNAVAILABLE") {
    return {
      title: "Location isn't available on this device",
      body: "You can still browse quests, join a party, and make predictions. GPS quests will show as unavailable.",
      actionLabel: null,
      action: "NONE",
      degraded: true,
    };
  }

  if (permission === "NOT_REQUESTED") {
    return {
      title: "Find quests around you",
      body: "SideQuest uses your location to show nearby quests and to confirm you reached a GPS objective. Your exact position is never shown to your party.",
      actionLabel: "ENABLE LOCATION",
      action: "REQUEST_FOREGROUND",
      degraded: false,
    };
  }

  if (permission === "DENIED") {
    return {
      title: "Location is turned off for SideQuest",
      body: "Quests near you and GPS verification need location access. Everything else keeps working. You can turn it back on in Settings at any time.",
      actionLabel: "OPEN SETTINGS",
      action: "OPEN_SETTINGS",
      degraded: true,
    };
  }

  if (!service.servicesEnabled) {
    return {
      title: "Device location services are off",
      body: "Turn on location services to see nearby quests. SideQuest can't read your position until then.",
      actionLabel: "OPEN SETTINGS",
      action: "OPEN_SETTINGS",
      degraded: true,
    };
  }

  if (permission === "APPROXIMATE") {
    return {
      title: "Precise location is off",
      body: "You'll still see quests in your area. GPS verification needs precise location so we can tell you actually arrived.",
      actionLabel: "USE PRECISE LOCATION",
      action: "REQUEST_FOREGROUND",
      degraded: true,
    };
  }

  if (permission === "FOREGROUND" && service.backgroundSupported) {
    return {
      title: "Keep a quest tracking while you walk",
      body: "Allow location while SideQuest is in the background and an active quest can verify your arrival without you keeping the app open. It stops automatically when the quest ends, and you can pause it any time.",
      actionLabel: "ALLOW DURING QUESTS",
      action: "REQUEST_BACKGROUND",
      degraded: false,
    };
  }

  if (permission === "FOREGROUND") {
    return {
      title: "Location is on",
      body: "Nearby quests and GPS verification work while SideQuest is open. This build can't run background updates, so keep the app open when you're finishing a GPS quest.",
      actionLabel: null,
      action: "NONE",
      degraded: false,
    };
  }

  return {
    title: "Location is on",
    body: "Nearby quests and GPS verification are active. Background updates run only during an active quest or a party session you started.",
    actionLabel: null,
    action: "NONE",
    degraded: false,
  };
}

/** Ranks permission states so a provider can report the strongest it reached. */
export function isAtLeast(
  state: LocationPermissionState,
  level: LocationPermissionLevel,
): boolean {
  if (level === "BACKGROUND") return state === "BACKGROUND";
  return (
    state === "FOREGROUND" || state === "BACKGROUND" || state === "APPROXIMATE"
  );
}
