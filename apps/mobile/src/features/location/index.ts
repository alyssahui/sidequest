export { LocationApi, LocationApiError } from "./api";
export { canUseMapbox, readLocationConfig } from "./config";
export type { LocationFeatureConfig, LocationProviderKind } from "./config";
export { buildDemoQuestMarkers, demoPlayerStart } from "./demoQuests";
export { LocationMapScreen } from "./LocationMapScreen";
export { LocationPrivacyControls } from "./components/LocationPrivacyControls";
export { PermissionGate } from "./components/PermissionGate";
export { FallbackMapSurface } from "./map/FallbackMapSurface";
export { MapSurface } from "./map/MapSurface";
export { QuestDetailSheet } from "./map/QuestDetailSheet";
export {
  formatDistance,
  formatTimeRemaining,
  markerKinds,
  markerStyleFor,
  markerStyles,
  type MarkerKind,
  type MarkerStyle,
  type QuestMarker,
} from "./map/markerRegistry";
export {
  clampToEdge,
  fitViewport,
  isOnScreen,
  project,
  type ScreenPoint,
  type Viewport,
} from "./map/projection";
export {
  chooseProvider,
  createSimulatedProvider,
  selectLocationProvider,
  SimulatedLocationProvider,
  type ProviderDecision,
  type SelectedProvider,
} from "./providers";
export { useLocationSession } from "./useLocationSession";
export type {
  LocationSessionState,
  LocationSessionStatus,
  UseLocationSessionOptions,
} from "./useLocationSession";
export { usePartyPresence } from "./usePartyPresence";
