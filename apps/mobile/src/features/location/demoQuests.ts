import type { Coordinates } from "@sidequest/contracts/location";
import { demoOrigin, destinationPoint } from "@sidequest/location";

import type { QuestMarker } from "./map/markerRegistry";

/**
 * Where each demo quest sits relative to the player, as a compass bearing and
 * a distance in metres. Placing them relatively rather than at fixed
 * coordinates is what lets the demo work anywhere: the quests spawn around you,
 * distances are real, and the walk to one is a walk you could actually take.
 */
const layout = [
  { bearing: 35, meters: 420 },
  { bearing: 145, meters: 260 },
  { bearing: 250, meters: 700 },
  { bearing: 320, meters: 340 },
] as const;

/**
 * Curated demo markers.
 *
 * The location branch owns only the map rendering; the quests branch replaces
 * this with real `QuestInstance` data. It exists so the map is populated and
 * the GPS flow is demonstrable before that lands, and the shape it returns is
 * the shape the quests module should supply.
 *
 * `now` is passed in so expiry times are deterministic relative to the demo
 * start rather than to whenever the module happened to be imported. `origin`
 * defaults to the scripted route's start so the simulated walk still lines up.
 */
export function buildDemoQuestMarkers(
  now: number,
  origin: Coordinates = demoOrigin,
): QuestMarker[] {
  const minutes = (count: number) =>
    new Date(now + count * 60_000).toISOString();
  const at = (index: number): Coordinates => {
    const spot = layout[index];
    if (!spot) return origin;
    return destinationPoint(origin, spot.bearing, spot.meters);
  };

  const bakery = at(0);
  const multiplayer = at(1);
  const raid = at(2);
  const limited = at(3);

  return [
    {
      id: "quest-demo-bakery",
      kind: "ADAPTIVE",
      title: "Find a pastry you have never eaten",
      coordinates: bakery,
      rewardCoins: 30,
      expiresAt: minutes(42),
      verificationSummary: "GPS + TIME",
      detail:
        "There is a bakery near here you have walked past a hundred times.",
      requirement: {
        type: "GPS",
        target: bakery,
        radiusMeters: 40,
        maxAccuracyMeters: 50,
      },
    },
    {
      id: "quest-demo-multiplayer",
      kind: "MULTIPLAYER",
      title: "Find somewhere none of you have eaten",
      coordinates: multiplayer,
      rewardCoins: 150,
      expiresAt: minutes(90),
      verificationSummary: "GPS + PHOTO",
      detail: "Three party members are nearby. Go together.",
      participantCount: 3,
      requirement: {
        type: "GPS",
        target: multiplayer,
        radiusMeters: 60,
        maxAccuracyMeters: 60,
      },
    },
    {
      id: "quest-demo-raid",
      kind: "RAID",
      title: "Saturday expedition",
      coordinates: raid,
      rewardCoins: 400,
      expiresAt: minutes(600),
      verificationSummary: "GPS",
      detail: "A party objective broken into assigned tasks.",
      participantCount: 5,
      requirement: {
        type: "GPS",
        target: raid,
        radiusMeters: 120,
        maxAccuracyMeters: 75,
      },
    },
    {
      id: "quest-demo-limited",
      kind: "LIMITED_TIME",
      title: "Catch the sunset from high ground",
      coordinates: limited,
      rewardCoins: 60,
      expiresAt: minutes(18),
      verificationSummary: "GPS + TIME",
      detail: "Gone in under twenty minutes.",
      requirement: {
        type: "GPS",
        target: limited,
        radiusMeters: 50,
        maxAccuracyMeters: 50,
      },
    },
  ];
}

/** Where the demo player stands before the simulator starts walking. */
export const demoPlayerStart = demoOrigin;
