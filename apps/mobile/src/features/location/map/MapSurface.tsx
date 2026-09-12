import type { Coordinates } from "@sidequest/contracts/location";

import { canUseMapbox, type LocationFeatureConfig } from "../config";
import { FallbackMapSurface } from "./FallbackMapSurface";
import type { QuestMarker } from "./markerRegistry";

export type MapSurfaceProps = {
  config: LocationFeatureConfig;
  playerPosition: Coordinates | null;
  markers: readonly QuestMarker[];
  selectedMarkerId: string | null;
  onSelectMarker: (markerId: string) => void;
  nearbyPartyCount?: number;
  nearbyAreaLabel?: string;
};

/**
 * Chooses the map renderer.
 *
 * `@rnmapbox/maps` is deliberately not a dependency of this workspace. It is a
 * native module that cannot run in Expo Go and would force every parallel
 * branch through a prebuild, so the adapter resolves it at runtime and the
 * deterministic surface is the default rather than the error case.
 *
 * To enable Mapbox: install `@rnmapbox/maps`, add its config plugin to
 * `app.json`, set `EXPO_PUBLIC_MAPBOX_TOKEN`, and make a development build.
 * Then implement `MapboxMapSurface` against the same props and switch on it
 * here. Nothing else in the feature changes, because everything above this
 * component talks in coordinates and markers rather than map APIs.
 */
export function MapSurface({ config, ...props }: MapSurfaceProps) {
  // Reserved for the Mapbox path; the fallback is correct until the native
  // module and a token are both present.
  void canUseMapbox(config);

  return <FallbackMapSurface {...props} />;
}
