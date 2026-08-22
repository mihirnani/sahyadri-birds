/* Birds of the Sahyadris – offline service worker.
   Cache-safe pattern: a cache/quota failure never blocks a network response. */
"use strict";

const PREFIX = "sahyadri-birds-";
const VERSION = "v6";
const SHELL_CACHE = `${PREFIX}shell-${VERSION}`;
const IMAGE_CACHE = `${PREFIX}images-${VERSION}`;

const SHELL = [
  "./",
  "./index.html",
  "./sahyadri-birds.webmanifest",
  "./sahyadri-birds-icon-32.png",
  "./sahyadri-birds-icon-180.png",
  "./sahyadri-birds-icon-192.png",
  "./sahyadri-birds-icon-512.png",
  "./assets/css/main.css",
  "./assets/js/config.js",
  "./assets/js/data-loader.js",
  "./assets/js/app.js",
  "./assets/data/birds.json",
  "./assets/data/families.json",
  "./assets/data/resources.json",
  "./assets/data/site-meta.json",
  "./assets/data/sites.json"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await Promise.allSettled(SHELL.map(async (url) => {
      const response = await fetch(new Request(url, { cache: "reload" }));
      if (response.ok) await cache.put(url, response);
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keep = new Set([SHELL_CACHE, IMAGE_CACHE]);
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((k) => k.startsWith(PREFIX) && !keep.has(k)).map((k) => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, SHELL_CACHE));
    return;
  }

  if (sameOrigin && request.destination === "image") {
    event.respondWith(cacheFirstImage(request, event));
    return;
  }

  if (sameOrigin) {
    event.respondWith(staleWhileRevalidate(request, SHELL_CACHE));
  }
});

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request, { cache: "no-store" });
    if (response.ok) {
      try { await cache.put(request, response.clone()); } catch (e) {}
    }
    return response;
  } catch (e) {
    return (await cache.match(request)) || (await caches.match("./index.html"));
  }
}

async function cacheFirstImage(request, event) {
  const cache = await caches.open(IMAGE_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok && response.status === 200) {
      const copy = response.clone();
      event.waitUntil((async () => {
        try { await cache.put(request, copy); } catch (e) {}
      })());
    }
    return response;
  } catch (e) {
    return new Response("", { status: 504, statusText: "Image unavailable offline" });
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then(async (response) => {
      if (response.ok) {
        try { await cache.put(request, response.clone()); } catch (e) {}
      }
      return response;
    })
    .catch(() => cached);
  return cached || network;
}
