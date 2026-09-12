import type { PropsWithChildren } from "react";

import { colors } from "@sidequest/ui/theme";

/**
 * HTML shell for the web build only. Native platforms never render this.
 *
 * It adds the PWA manifest, the icons, and the service-worker registration.
 * Expo's Metro web target stopped generating these in SDK 50, so they live here
 * and in `public/` rather than being produced by the build.
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        {/* viewport-fit=cover so the safe-area insets work in standalone mode. */}
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover"
        />

        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content={colors.brandDeep} />
        <link rel="icon" href="/favicon.png" />
        {/* iOS ignores the manifest for the home-screen icon and title. */}
        <link rel="apple-touch-icon" href="/icons/icon-180.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="SideQuest" />
        <meta
          name="apple-mobile-web-app-status-bar-style"
          content="black-translucent"
        />

        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: backgroundStyle }} />
        <script dangerouslySetInnerHTML={{ __html: registerServiceWorker }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

/**
 * Registration is guarded on a secure context because browsers expose
 * `navigator.serviceWorker` only over HTTPS or on localhost — the same rule
 * that gates the Geolocation API, so both fail together on a plain LAN address.
 */
const registerServiceWorker = `
if ('serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/sw.js').catch(function (error) {
      console.warn('SideQuest service worker registration failed:', error);
    });
  });
}
`;

const backgroundStyle = `
html, body { height: 100%; background-color: ${colors.canvas}; }
body { overflow: hidden; overscroll-behavior-y: none; }
#root { display: flex; height: 100%; flex: 1; }
`;

/**
 * Expo's recommended reset: without it, `<ScrollView>` scrolls the document
 * rather than its own container on web.
 */
function ScrollViewStyleReset() {
  return (
    <style
      dangerouslySetInnerHTML={{
        __html: `#root, body { display: flex; flex-direction: column; }`,
      }}
      id="expo-reset"
    />
  );
}
