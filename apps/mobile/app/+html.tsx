import type { PropsWithChildren } from "react";
import { ScrollViewStyleReset } from "expo-router/html";

const serviceWorkerScript = `
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js').catch(function (error) {
        console.warn('SideQuest service worker registration failed', error);
      });
    });
  }
`;

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover, shrink-to-fit=no"
        />
        <meta name="theme-color" content="#71272A" />
        <meta
          name="description"
          content="Turn real life into a multiplayer adventure with your friends."
        />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta
          name="apple-mobile-web-app-status-bar-style"
          content="black-translucent"
        />
        <meta name="apple-mobile-web-app-title" content="SideQuest" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" href="/icons/sidequest.svg" type="image/svg+xml" />
        <ScrollViewStyleReset />
        <script dangerouslySetInnerHTML={{ __html: serviceWorkerScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
