/**
 * A real-map failure must never leave the PWA on a blank loading panel.
 * CSP/tile errors are often emitted by MapLibre rather than thrown, so fail
 * after the first pre-load error or when the map has not loaded in time.
 */
export function shouldUseFallbackMap(input: {
  loaded: boolean;
  errorCount: number;
  tileUrl: string;
}): boolean {
  if (!/^https:\/\/.+\{z\}.+\{x\}.+\{y\}/.test(input.tileUrl)) return true;
  return !input.loaded && input.errorCount > 0;
}
