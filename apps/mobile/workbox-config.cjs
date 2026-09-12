module.exports = {
  globDirectory: "dist",
  globPatterns: ["**/*.{html,js,css,json,svg,ico,png,woff2,ttf}"],
  globIgnores: ["sw.js", "workbox-*.js"],
  swDest: "dist/sw.js",
  cleanupOutdatedCaches: true,
  clientsClaim: true,
  skipWaiting: false,
  navigateFallback: "/index.html",
  navigateFallbackDenylist: [/^\/v1\//],
  runtimeCaching: [
    {
      urlPattern: ({ request }) => request.destination === "image",
      handler: "CacheFirst",
      options: {
        cacheName: "sidequest-images-v1",
        expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 14 },
      },
    },
  ],
};
