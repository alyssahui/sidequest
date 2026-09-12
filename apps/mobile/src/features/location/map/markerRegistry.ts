import type {
  Coordinates,
  GpsRequirement,
} from "@sidequest/contracts/location";
import { colors } from "@sidequest/ui/theme";

/**
 * Marker kinds are a registry rather than a switch, so the quests branch can
 * add a kind by adding a row here instead of editing the map component.
 */
export const markerKinds = [
  "ADAPTIVE",
  "MULTIPLAYER",
  "RAID",
  "LIMITED_TIME",
  "PARTY_MEMBER",
] as const;

export type MarkerKind = (typeof markerKinds)[number];

export type MarkerStyle = {
  glyph: string;
  /** Uppercase HUD label shown on the marker's badge. */
  label: string;
  background: string;
  border: string;
  /**
   * Tap area. Never below 44, the platform minimum touch target, even though
   * the drawn pin is smaller — the pressable is transparent padding around it.
   */
  size: number;
  /** Diameter of the drawn pin. Larger reads as more important at a glance. */
  visualSize: number;
  /** Font size for the glyph inside the pin. */
  glyphSize: number;
  /** Whether the marker pulses to signal something new or live. */
  pulse: boolean;
  /** Screen-reader description prefix. */
  accessibilityPrefix: string;
};

export const markerStyles: Record<MarkerKind, MarkerStyle> = {
  ADAPTIVE: {
    glyph: "🍓",
    label: "SPAWNED",
    background: colors.surfaceStrong,
    border: colors.brand,
    size: 52,
    visualSize: 40,
    glyphSize: 18,
    pulse: true,
    accessibilityPrefix: "Side quest spawned",
  },
  MULTIPLAYER: {
    glyph: "⚡",
    label: "MULTIPLAYER",
    background: colors.brand,
    border: colors.inkInverse,
    size: 58,
    visualSize: 44,
    glyphSize: 20,
    pulse: true,
    accessibilityPrefix: "Multiplayer quest",
  },
  RAID: {
    glyph: "☠️",
    label: "BOSS RAID",
    background: colors.brandDeep,
    border: colors.warning,
    size: 64,
    visualSize: 48,
    glyphSize: 22,
    pulse: false,
    accessibilityPrefix: "Boss raid",
  },
  LIMITED_TIME: {
    glyph: "⏳",
    label: "LIMITED",
    background: colors.warning,
    border: colors.brandDeep,
    size: 52,
    visualSize: 40,
    glyphSize: 18,
    pulse: true,
    accessibilityPrefix: "Limited time event",
  },
  PARTY_MEMBER: {
    glyph: "👥",
    // Party members are never drawn at a real coordinate. This marker is a
    // coarse area badge, and the label says so.
    label: "NEARBY",
    background: colors.success,
    border: colors.ink,
    size: 44,
    visualSize: 34,
    glyphSize: 16,
    pulse: false,
    accessibilityPrefix: "Party member nearby",
  },
};

export type QuestMarker = {
  id: string;
  kind: MarkerKind;
  title: string;
  /** Quest objectives have a real position; this is the player's own target. */
  coordinates: Coordinates;
  rewardCoins: number;
  expiresAt: string;
  requirement: GpsRequirement;
  /** Short verification summary such as "GPS + TIME". */
  verificationSummary: string;
  detail?: string;
  participantCount?: number;
};

export function markerStyleFor(kind: MarkerKind): MarkerStyle {
  // An unknown kind from a future branch renders as a plain spawn rather than
  // crashing the map.
  return markerStyles[kind] ?? markerStyles.ADAPTIVE;
}

/** Distance label that matches how a player thinks about walking there. */
export function formatDistance(meters: number): string {
  // Inside roughly one GPS fix of the target, a number is meaningless and
  // rounding to the nearest 10 would read as a flat "0m away".
  if (meters < 15) return "you're here";
  if (meters < 1_000) return `${Math.round(meters / 10) * 10}m away`;
  return `${(meters / 1_000).toFixed(1)}km away`;
}

/** Countdown label. Returns "expired" rather than a negative duration. */
export function formatTimeRemaining(expiresAt: string, now: number): string {
  const remainingMs = Date.parse(expiresAt) - now;
  if (Number.isNaN(remainingMs) || remainingMs <= 0) return "expired";

  const minutes = Math.floor(remainingMs / 60_000);
  if (minutes < 60) return `${Math.max(1, minutes)} min left`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m left`;
  return `${Math.floor(hours / 24)}d left`;
}
