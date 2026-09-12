import { describe, expect, it } from "vitest";

import {
  bearingDegrees,
  boundingBox,
  destinationPoint,
  distanceMeters,
  interpolate,
  fromPostGisPoint,
  isValidCoordinates,
  looksLikeSwappedCoordinates,
  normalizeLongitude,
  toPostGisPoint,
} from "../src/geometry";

const cmuTheCut = { latitude: 40.4433, longitude: -79.9436 };
const craigStreet = { latitude: 40.4494, longitude: -79.9497 };

describe("distanceMeters", () => {
  it("returns zero for the same point", () => {
    expect(distanceMeters(cmuTheCut, cmuTheCut)).toBe(0);
  });

  it("matches a known short campus distance", () => {
    // ~830m by great circle between The Cut and Craig Street.
    expect(distanceMeters(cmuTheCut, craigStreet)).toBeCloseTo(830, -2);
  });

  it("is symmetric", () => {
    expect(distanceMeters(cmuTheCut, craigStreet)).toBeCloseTo(
      distanceMeters(craigStreet, cmuTheCut),
      9,
    );
  });

  it("takes the short way across the antimeridian", () => {
    const east = { latitude: 0, longitude: 179.9 };
    const west = { latitude: 0, longitude: -179.9 };

    const meters = distanceMeters(east, west);

    // 0.2 degrees of longitude at the equator is ~22km, not most of the planet.
    expect(meters).toBeGreaterThan(20_000);
    expect(meters).toBeLessThan(25_000);
  });

  it("measures a pole-to-pole path as half the circumference", () => {
    const meters = distanceMeters(
      { latitude: 90, longitude: 0 },
      { latitude: -90, longitude: 0 },
    );

    expect(meters).toBeCloseTo(20_015_086, -3);
  });

  it("is unaffected by the longitude chosen at a pole", () => {
    const viaZero = distanceMeters(
      { latitude: 90, longitude: 0 },
      { latitude: 40, longitude: 0 },
    );
    const viaOneEighty = distanceMeters(
      { latitude: 90, longitude: 180 },
      { latitude: 40, longitude: 0 },
    );

    expect(viaZero).toBeCloseTo(viaOneEighty, 3);
  });

  it("produces a wildly different answer when latitude and longitude are swapped", () => {
    const swappedFrom = {
      latitude: cmuTheCut.longitude,
      longitude: cmuTheCut.latitude,
    };
    const swappedTo = {
      latitude: craigStreet.longitude,
      longitude: craigStreet.latitude,
    };

    // Documents why the swap guard exists: the mistake stays numerically valid
    // but the measured distance is meaningless.
    expect(distanceMeters(swappedFrom, swappedTo)).not.toBeCloseTo(
      distanceMeters(cmuTheCut, craigStreet),
      0,
    );
  });
});

describe("looksLikeSwappedCoordinates", () => {
  it("flags an impossible latitude that would be a valid longitude", () => {
    expect(
      looksLikeSwappedCoordinates({ latitude: 139.69, longitude: 35.68 }),
    ).toBe(true);
  });

  it("does not flag a legitimate pair", () => {
    expect(looksLikeSwappedCoordinates(cmuTheCut)).toBe(false);
  });

  it("cannot detect a swap where both orderings are in range", () => {
    // Honest limitation, and the reason the PostGIS converters exist:
    // Pittsburgh's longitude of -79.94 is also a perfectly valid latitude, so
    // the swapped pair passes every range check.
    expect(
      looksLikeSwappedCoordinates({ latitude: -79.9436, longitude: 40.4433 }),
    ).toBe(false);
  });

  it("does not flag a pair that is invalid in both orderings", () => {
    expect(looksLikeSwappedCoordinates({ latitude: 200, longitude: 200 })).toBe(
      false,
    );
  });
});

describe("PostGIS boundary conversion", () => {
  it("writes longitude first and reads latitude second", () => {
    const point = toPostGisPoint(cmuTheCut);

    expect(point[0]).toBe(cmuTheCut.longitude);
    expect(point[1]).toBe(cmuTheCut.latitude);
  });

  it("round-trips without reordering", () => {
    expect(fromPostGisPoint(toPostGisPoint(craigStreet))).toEqual(craigStreet);
  });
});

describe("isValidCoordinates", () => {
  it.each([
    [{ latitude: 91, longitude: 0 }, false],
    [{ latitude: -91, longitude: 0 }, false],
    [{ latitude: 0, longitude: 181 }, false],
    [{ latitude: 0, longitude: -181 }, false],
    [{ latitude: 90, longitude: 180 }, true],
    [{ latitude: -90, longitude: -180 }, true],
    [{ latitude: Number.NaN, longitude: 0 }, false],
    [{ latitude: 0, longitude: Number.POSITIVE_INFINITY }, false],
  ])("validates %j as %s", (input, expected) => {
    expect(isValidCoordinates(input)).toBe(expected);
  });

  it("rejects non-objects", () => {
    expect(isValidCoordinates(null)).toBe(false);
    expect(isValidCoordinates("40.44,-79.94")).toBe(false);
  });
});

describe("destinationPoint", () => {
  it("round-trips with distanceMeters", () => {
    const moved = destinationPoint(cmuTheCut, 45, 500);
    expect(distanceMeters(cmuTheCut, moved)).toBeCloseTo(500, 6);
  });

  it("wraps longitude when crossing the antimeridian", () => {
    const start = { latitude: 0, longitude: 179.99 };
    const moved = destinationPoint(start, 90, 5_000);

    expect(moved.longitude).toBeLessThan(0);
    expect(moved.longitude).toBeGreaterThanOrEqual(-180);
    expect(distanceMeters(start, moved)).toBeCloseTo(5_000, 3);
  });
});

describe("bearingDegrees", () => {
  it("reports due north as 0 and due east as 90", () => {
    expect(
      bearingDegrees(
        { latitude: 0, longitude: 0 },
        { latitude: 1, longitude: 0 },
      ),
    ).toBeCloseTo(0, 6);
    expect(
      bearingDegrees(
        { latitude: 0, longitude: 0 },
        { latitude: 0, longitude: 1 },
      ),
    ).toBeCloseTo(90, 6);
  });
});

describe("interpolate", () => {
  it("lands on the endpoints at 0 and 1", () => {
    expect(interpolate(cmuTheCut, craigStreet, 0)).toEqual(cmuTheCut);
    expect(
      distanceMeters(interpolate(cmuTheCut, craigStreet, 1), craigStreet),
    ).toBeCloseTo(0, 6);
  });

  it("puts the halfway point at half the distance", () => {
    const total = distanceMeters(cmuTheCut, craigStreet);
    const midpoint = interpolate(cmuTheCut, craigStreet, 0.5);

    expect(distanceMeters(cmuTheCut, midpoint)).toBeCloseTo(total / 2, 3);
  });

  it("clamps fractions outside the unit interval", () => {
    expect(interpolate(cmuTheCut, craigStreet, -1)).toEqual(cmuTheCut);
    expect(
      distanceMeters(interpolate(cmuTheCut, craigStreet, 2), craigStreet),
    ).toBeCloseTo(0, 6);
  });
});

describe("normalizeLongitude", () => {
  it.each([
    [181, -179],
    [-181, 179],
    [540, 180 - 360],
    [0, 0],
  ])("normalizes %s to %s", (input, expected) => {
    expect(normalizeLongitude(input)).toBeCloseTo(expected, 9);
  });
});

describe("boundingBox", () => {
  it("contains the radius in both directions", () => {
    const box = boundingBox(cmuTheCut, 1_000);

    expect(box.minLatitude).toBeLessThan(cmuTheCut.latitude);
    expect(box.maxLatitude).toBeGreaterThan(cmuTheCut.latitude);
    expect(box.wrapsAntimeridian).toBe(false);
    expect(
      distanceMeters(cmuTheCut, {
        latitude: box.maxLatitude,
        longitude: cmuTheCut.longitude,
      }),
    ).toBeCloseTo(1_000, 0);
  });

  it("flags a box that crosses the antimeridian", () => {
    const box = boundingBox({ latitude: 0, longitude: 179.99 }, 5_000);
    expect(box.wrapsAntimeridian).toBe(true);
  });

  it("degrades to the whole longitude range at the pole", () => {
    const box = boundingBox({ latitude: 90, longitude: 0 }, 1_000);
    expect(box.wrapsAntimeridian).toBe(true);
  });
});
