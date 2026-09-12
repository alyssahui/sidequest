import { demoOrigin, demoQuestTarget } from "@sidequest/location";

import type { QuestMarker } from "./map/markerRegistry";

/**
 * Curated demo markers around CMU.
 *
 * The location branch owns only the map rendering; the quests branch replaces
 * this list with real `QuestInstance` data. It exists so the map is populated
 * and the GPS flow is demonstrable before that lands, and the shape it returns
 * is the shape the quests module should supply.
 *
 * `now` is passed in so expiry times are deterministic relative to the demo
 * start rather than to whenever the module happened to be imported.
 */
export function buildDemoQuestMarkers(now: number): QuestMarker[] {
  const minutes = (count: number) =>
    new Date(now + count * 60_000).toISOString();

  return [
    {
      id: "quest-demo-bakery",
      kind: "ADAPTIVE",
      title: "Find a pastry you have never eaten",
      coordinates: demoQuestTarget,
      rewardCoins: 30,
      expiresAt: minutes(42),
      verificationSummary: "GPS + TIME",
      detail:
        "There is a bakery on Craig Street you have walked past a hundred times.",
      requirement: {
        type: "GPS",
        target: demoQuestTarget,
        radiusMeters: 40,
        maxAccuracyMeters: 50,
      },
    },
    {
      id: "quest-demo-multiplayer",
      kind: "MULTIPLAYER",
      title: "Find somewhere none of you have eaten",
      coordinates: { latitude: 40.4471, longitude: -79.9471 },
      rewardCoins: 150,
      expiresAt: minutes(90),
      verificationSummary: "GPS + PHOTO",
      detail: "Three party members are nearby. Go together.",
      participantCount: 3,
      requirement: {
        type: "GPS",
        target: { latitude: 40.4471, longitude: -79.9471 },
        radiusMeters: 60,
        maxAccuracyMeters: 60,
      },
    },
    {
      id: "quest-demo-raid",
      kind: "RAID",
      title: "Saturday Schenley expedition",
      coordinates: { latitude: 40.4381, longitude: -79.9436 },
      rewardCoins: 400,
      expiresAt: minutes(600),
      verificationSummary: "GPS",
      detail: "A party objective broken into assigned tasks.",
      participantCount: 5,
      requirement: {
        type: "GPS",
        target: { latitude: 40.4381, longitude: -79.9436 },
        radiusMeters: 120,
        maxAccuracyMeters: 75,
      },
    },
    {
      id: "quest-demo-limited",
      kind: "LIMITED_TIME",
      title: "Sunset from the Cathedral lawn",
      coordinates: { latitude: 40.4443, longitude: -79.9531 },
      rewardCoins: 60,
      expiresAt: minutes(18),
      verificationSummary: "GPS + TIME",
      detail: "Gone in under twenty minutes.",
      requirement: {
        type: "GPS",
        target: { latitude: 40.4443, longitude: -79.9531 },
        radiusMeters: 50,
        maxAccuracyMeters: 50,
      },
    },
  ];
}

/** Where the demo player stands before the simulator starts walking. */
export const demoPlayerStart = demoOrigin;
