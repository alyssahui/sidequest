import type { Coordinates } from "@sidequest/contracts/location";

import {
  EARTH_RADIUS_METERS,
  distanceMeters,
  normalizeLongitude,
} from "./geometry";

/**
 * A named area a coarse position can be reported as. Named areas are the only
 * human-readable labels the system produces; anything outside every named area
 * degrades to a grid cell with a generic label, never to coordinates.
 */
export type NamedArea = {
  id: string;
  label: string;
  center: Coordinates;
  radiusMeters: number;
};

export type CoarseArea = {
  id: string;
  label: string;
};

export interface CoarseAreaResolver {
  resolve(coordinates: Coordinates): CoarseArea;
}

/**
 * Curated demo areas around CMU/Pittsburgh. These exist so presence reads as
 * "near Craig Street" rather than a grid id, and so the tokenless demo has
 * believable place names without a geocoding service.
 */
export const demoNamedAreas: readonly NamedArea[] = [
  {
    id: "area-cmu-campus",
    label: "on CMU campus",
    center: { latitude: 40.4433, longitude: -79.9436 },
    radiusMeters: 500,
  },
  {
    id: "area-craig-street",
    label: "near Craig Street",
    center: { latitude: 40.4494, longitude: -79.9497 },
    radiusMeters: 400,
  },
  {
    id: "area-schenley-park",
    label: "in Schenley Park",
    center: { latitude: 40.4381, longitude: -79.9436 },
    radiusMeters: 700,
  },
  {
    id: "area-squirrel-hill",
    label: "in Squirrel Hill",
    center: { latitude: 40.4382, longitude: -79.9223 },
    radiusMeters: 900,
  },
  {
    id: "area-oakland",
    label: "in Oakland",
    center: { latitude: 40.4416, longitude: -79.9564 },
    radiusMeters: 800,
  },
  {
    id: "area-shadyside",
    label: "in Shadyside",
    center: { latitude: 40.4519, longitude: -79.9345 },
    radiusMeters: 900,
  },
];

const METERS_PER_DEGREE_LATITUDE = (Math.PI * EARTH_RADIUS_METERS) / 180;

/**
 * Snaps a position to a fixed grid whose cell edge is `gridMeters`.
 *
 * The returned id identifies the cell, not the position: every point in the
 * cell produces the same id, so two members can be compared for "same area"
 * without either coordinate being shared. Cell indices are integers, so the id
 * cannot be inverted to anything finer than the cell itself.
 */
export function gridCellId(
  coordinates: Coordinates,
  gridMeters: number,
): string {
  const latIndex = Math.floor(
    (coordinates.latitude * METERS_PER_DEGREE_LATITUDE) / gridMeters,
  );
  // Longitude cells are sized at the cell's own latitude so they stay roughly
  // square rather than collapsing near the poles.
  const cellLatitude =
    ((latIndex + 0.5) * gridMeters) / METERS_PER_DEGREE_LATITUDE;
  const metersPerDegreeLon = Math.max(
    1,
    METERS_PER_DEGREE_LATITUDE * Math.cos((cellLatitude * Math.PI) / 180),
  );
  const lonIndex = Math.floor(
    (normalizeLongitude(coordinates.longitude) * metersPerDegreeLon) /
      gridMeters,
  );
  return `cell:${gridMeters}:${latIndex}:${lonIndex}`;
}

export type GridAreaResolverOptions = {
  gridMeters: number;
  namedAreas?: readonly NamedArea[];
  /** Label used when no named area contains the point. */
  fallbackLabel?: string;
};

/**
 * Default resolver: a named area when the point falls inside one, otherwise an
 * anonymous grid cell. It never returns anything derived finely enough to
 * recover a street address.
 */
export function createGridAreaResolver({
  gridMeters,
  namedAreas = demoNamedAreas,
  fallbackLabel = "somewhere out in the world",
}: GridAreaResolverOptions): CoarseAreaResolver {
  return {
    resolve(coordinates) {
      let best: { area: NamedArea; distance: number } | undefined;
      for (const area of namedAreas) {
        const distance = distanceMeters(coordinates, area.center);
        if (distance > area.radiusMeters) continue;
        if (!best || distance < best.distance) best = { area, distance };
      }

      if (best) return { id: best.area.id, label: best.area.label };
      return { id: gridCellId(coordinates, gridMeters), label: fallbackLabel };
    },
  };
}

/**
 * Label for a cluster of members. Uses the area they share when they agree,
 * and a deliberately vague phrase when they do not, rather than picking one
 * member's area and implicitly revealing where that member is.
 */
export function clusterAreaLabel(
  areas: readonly CoarseArea[],
): string | undefined {
  if (areas.length === 0) return undefined;
  const first = areas[0];
  if (!first) return undefined;
  return areas.every((area) => area.id === first.id)
    ? first.label
    : "spread across the area";
}
