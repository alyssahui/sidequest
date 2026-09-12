import type { Coordinates } from "@sidequest/contracts/location";

import { EARTH_RADIUS_METERS, distanceMeters } from "@sidequest/location";

export type Viewport = {
  width: number;
  height: number;
  center: Coordinates;
  /** Meters covered by the shorter screen axis. */
  spanMeters: number;
};

export type ScreenPoint = { x: number; y: number };

const METERS_PER_DEGREE_LATITUDE = (Math.PI * EARTH_RADIUS_METERS) / 180;

/**
 * Projects a coordinate onto the fallback map surface.
 *
 * An equirectangular projection about the viewport centre, with the longitude
 * axis scaled by cos(latitude) so the world is not stretched east-west. Over
 * the few hundred metres a quest map shows, the distortion against a true
 * Mercator projection is far below one pixel, and the arithmetic stays simple
 * enough to test exactly.
 */
export function project(
  coordinates: Coordinates,
  viewport: Viewport,
): ScreenPoint {
  const metersPerPixel =
    viewport.spanMeters /
    Math.max(1, Math.min(viewport.width, viewport.height));

  const latitudeMeters =
    (coordinates.latitude - viewport.center.latitude) *
    METERS_PER_DEGREE_LATITUDE;

  const cosLatitude = Math.cos((viewport.center.latitude * Math.PI) / 180);
  let deltaLongitude = coordinates.longitude - viewport.center.longitude;
  // Take the short way round so a viewport near the antimeridian does not fling
  // markers off the opposite edge.
  if (deltaLongitude > 180) deltaLongitude -= 360;
  if (deltaLongitude < -180) deltaLongitude += 360;

  const longitudeMeters =
    deltaLongitude * METERS_PER_DEGREE_LATITUDE * cosLatitude;

  return {
    x: viewport.width / 2 + longitudeMeters / metersPerPixel,
    // Screen y grows downward while latitude grows northward, hence the flip.
    y: viewport.height / 2 - latitudeMeters / metersPerPixel,
  };
}

/** True when a projected point is inside the viewport, allowing for a margin. */
export function isOnScreen(
  point: ScreenPoint,
  viewport: Viewport,
  marginPx = 0,
): boolean {
  return (
    point.x >= -marginPx &&
    point.x <= viewport.width + marginPx &&
    point.y >= -marginPx &&
    point.y <= viewport.height + marginPx
  );
}

/**
 * Clamps an off-screen point to the viewport edge, so a distant quest still
 * shows as a direction rather than disappearing.
 */
export function clampToEdge(
  point: ScreenPoint,
  viewport: Viewport,
  insetPx = 24,
): ScreenPoint {
  return {
    x: Math.min(Math.max(point.x, insetPx), viewport.width - insetPx),
    y: Math.min(Math.max(point.y, insetPx), viewport.height - insetPx),
  };
}

/**
 * A viewport that frames the player and every point of interest.
 *
 * `minSpanMeters` stops the map zooming absurdly far in when everything is in
 * one place, and the padding keeps markers off the screen edge.
 */
export function fitViewport(
  points: readonly Coordinates[],
  size: { width: number; height: number },
  options: { minSpanMeters?: number; paddingFactor?: number } = {},
): Viewport {
  const minSpanMeters = options.minSpanMeters ?? 300;
  const paddingFactor = options.paddingFactor ?? 1.4;

  const fallback: Viewport = {
    ...size,
    center: { latitude: 0, longitude: 0 },
    spanMeters: minSpanMeters,
  };

  const first = points[0];
  if (!first) return fallback;

  let minLatitude = first.latitude;
  let maxLatitude = first.latitude;
  let minLongitude = first.longitude;
  let maxLongitude = first.longitude;

  for (const point of points) {
    minLatitude = Math.min(minLatitude, point.latitude);
    maxLatitude = Math.max(maxLatitude, point.latitude);
    minLongitude = Math.min(minLongitude, point.longitude);
    maxLongitude = Math.max(maxLongitude, point.longitude);
  }

  const center: Coordinates = {
    latitude: (minLatitude + maxLatitude) / 2,
    longitude: (minLongitude + maxLongitude) / 2,
  };

  const diagonal = distanceMeters(
    { latitude: minLatitude, longitude: minLongitude },
    { latitude: maxLatitude, longitude: maxLongitude },
  );

  return {
    ...size,
    center,
    spanMeters: Math.max(minSpanMeters, diagonal * paddingFactor),
  };
}
