import type { Coordinates } from "@sidequest/contracts/location";

/** WGS-84 mean radius in meters, the usual choice for Haversine. */
export const EARTH_RADIUS_METERS = 6_371_008.8;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
const toDegrees = (radians: number) => (radians * 180) / Math.PI;

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function isValidLatitude(latitude: unknown): latitude is number {
  return isFiniteNumber(latitude) && latitude >= -90 && latitude <= 90;
}

export function isValidLongitude(longitude: unknown): longitude is number {
  return isFiniteNumber(longitude) && longitude >= -180 && longitude <= 180;
}

export function isValidCoordinates(value: unknown): value is Coordinates {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<Coordinates>;
  return (
    isValidLatitude(candidate.latitude) && isValidLongitude(candidate.longitude)
  );
}

/**
 * Detects the single most common integration bug in this codebase: PostGIS and
 * GeoJSON use longitude-first ordering, so a missed swap at that boundary lands
 * a latitude in the longitude slot. `{ latitude: -79.94, longitude: 40.44 }` is
 * a perfectly valid coordinate pair in the Atlantic, so validity alone will not
 * catch it. We flag the two detectable shapes:
 *
 * - `|latitude| > 90`, which is impossible and therefore certainly swapped;
 * - a pair that is out of range as given but in range once swapped.
 */
export function looksLikeSwappedCoordinates(value: {
  latitude: number;
  longitude: number;
}): boolean {
  const { latitude, longitude } = value;
  if (!isFiniteNumber(latitude) || !isFiniteNumber(longitude)) return false;
  const validAsGiven = isValidLatitude(latitude) && isValidLongitude(longitude);
  const validIfSwapped =
    isValidLatitude(longitude) && isValidLongitude(latitude);
  return !validAsGiven && validIfSwapped;
}

/**
 * Great-circle distance in meters.
 *
 * Haversine is used rather than equirectangular approximation because the
 * shortest path across the antimeridian must not become a trip around the
 * planet: `Math.sin(deltaLon / 2)` is periodic, so 179.9°E to 179.9°W measures
 * ~22km, not ~40,000km.
 */
export function distanceMeters(from: Coordinates, to: Coordinates): number {
  const lat1 = toRadians(from.latitude);
  const lat2 = toRadians(to.latitude);
  const deltaLat = lat2 - lat1;
  const deltaLon = toRadians(to.longitude - from.longitude);

  const sinHalfLat = Math.sin(deltaLat / 2);
  const sinHalfLon = Math.sin(deltaLon / 2);

  const a =
    sinHalfLat * sinHalfLat +
    Math.cos(lat1) * Math.cos(lat2) * sinHalfLon * sinHalfLon;

  // Clamp guards against a > 1 from floating-point drift at antipodal points.
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Normalizes a longitude into the [-180, 180) range used everywhere else. */
export function normalizeLongitude(longitude: number): number {
  const wrapped = (((longitude + 180) % 360) + 360) % 360;
  return wrapped - 180;
}

/**
 * Point at `distanceMeters` along `bearingDegrees` from `origin`.
 * Used by the simulator to walk a route and by tests to build boundary cases.
 */
export function destinationPoint(
  origin: Coordinates,
  bearingDegrees: number,
  meters: number,
): Coordinates {
  const angular = meters / EARTH_RADIUS_METERS;
  const bearing = toRadians(bearingDegrees);
  const lat1 = toRadians(origin.latitude);
  const lon1 = toRadians(origin.longitude);

  const sinLat2 =
    Math.sin(lat1) * Math.cos(angular) +
    Math.cos(lat1) * Math.sin(angular) * Math.cos(bearing);
  const lat2 = Math.asin(Math.min(1, Math.max(-1, sinLat2)));

  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angular) * Math.cos(lat1),
      Math.cos(angular) - Math.sin(lat1) * sinLat2,
    );

  return {
    latitude: toDegrees(lat2),
    longitude: normalizeLongitude(toDegrees(lon2)),
  };
}

/** Initial bearing in degrees from `from` to `to`. */
export function bearingDegrees(from: Coordinates, to: Coordinates): number {
  const lat1 = toRadians(from.latitude);
  const lat2 = toRadians(to.latitude);
  const deltaLon = toRadians(to.longitude - from.longitude);

  const y = Math.sin(deltaLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLon);

  return (toDegrees(Math.atan2(y, x)) + 360) % 360;
}

/** Linear interpolation along the great circle, `fraction` in [0, 1]. */
export function interpolate(
  from: Coordinates,
  to: Coordinates,
  fraction: number,
): Coordinates {
  const clamped = Math.min(1, Math.max(0, fraction));
  // Endpoints are returned exactly rather than recomputed, so a route segment
  // joins its neighbour without accumulating trigonometric drift.
  if (clamped === 0) return { ...from };
  if (clamped === 1) return { ...to };
  const total = distanceMeters(from, to);
  if (total === 0) return { ...from };
  return destinationPoint(from, bearingDegrees(from, to), total * clamped);
}

/**
 * Longitude-first pair, the ordering PostGIS and GeoJSON use.
 *
 * The range heuristic above cannot catch a swap between two values that are
 * both valid latitudes — Pittsburgh's longitude of -79.94 is a perfectly legal
 * latitude — so the actual protection against that bug is never writing a bare
 * array by hand. Everything crossing the database boundary goes through these
 * two functions, and the nominal type makes a raw `[number, number]` a type
 * error at the call site.
 */
export type PostGisPoint = readonly [longitude: number, latitude: number] & {
  readonly __postGisOrder: unique symbol;
};

export function toPostGisPoint(coordinates: Coordinates): PostGisPoint {
  return [
    coordinates.longitude,
    coordinates.latitude,
  ] as unknown as PostGisPoint;
}

export function fromPostGisPoint(
  point: readonly [number, number],
): Coordinates {
  return { latitude: point[1], longitude: point[0] };
}

/**
 * Bounding box for a radius query, returned longitude-first for the PostGIS
 * boundary. Latitudes clamp at the poles; longitudes may wrap, in which case
 * `wrapsAntimeridian` is true and callers must use an OR of two ranges.
 */
export function boundingBox(center: Coordinates, radiusMeters: number) {
  const latDelta = toDegrees(radiusMeters / EARTH_RADIUS_METERS);
  const cosLat = Math.cos(toRadians(center.latitude));
  // Near the poles the longitude delta explodes; fall back to the whole range.
  const lonDelta =
    Math.abs(cosLat) < 1e-9
      ? 180
      : toDegrees(radiusMeters / (EARTH_RADIUS_METERS * Math.abs(cosLat)));

  const minLatitude = Math.max(-90, center.latitude - latDelta);
  const maxLatitude = Math.min(90, center.latitude + latDelta);
  const rawMin = center.longitude - lonDelta;
  const rawMax = center.longitude + lonDelta;

  return {
    minLatitude,
    maxLatitude,
    minLongitude: normalizeLongitude(rawMin),
    maxLongitude: normalizeLongitude(rawMax),
    wrapsAntimeridian: lonDelta >= 180 || rawMin < -180 || rawMax > 180,
  };
}
