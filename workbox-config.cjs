// Service worker for the web build: run after `expo export` (see deploy-web.yml).
module.exports = {
  globDirectory: 'web/dist',
  globPatterns: ['**/*.{html,js,css,png,jpg,svg,ttf,woff2,json,ico}'],
  globIgnores: ['metadata.json'],
  maximumFileSizeToCacheInBytes: 15 * 1024 * 1024, // the JS bundle is several MB
  swDest: 'web/dist/sw.js',
  navigateFallback: '/index.html',
  cleanupOutdatedCaches: true,
  skipWaiting: false, // the page asks before switching versions (see public/index.html)
  clientsClaim: true,
  runtimeCaching: [
    // API data must always be live (the app keeps its own offline copy); uploaded images may be cached.
    { urlPattern: ({ url, request }) => url.hostname.startsWith('api.') && request.destination !== 'image', handler: 'NetworkOnly' },
    {
      urlPattern: ({ request }) => request.destination === 'image',
      handler: 'StaleWhileRevalidate',
      options: { cacheName: 'images', expiration: { maxEntries: 300, maxAgeSeconds: 30 * 24 * 3600 } },
    },
  ],
};
