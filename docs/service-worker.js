/* TataDiet 5.2 - service worker stabile, scope-safe anche su GitHub Pages project site. */
"use strict";

const SCRIPT_URL = new URL(self.location.href);
const VERSION = SCRIPT_URL.searchParams.get("v") || "dev";
const CACHE_PREFIX = "diet-plan";
const CORE_CACHE = `${CACHE_PREFIX}-core-${VERSION}`;
const RUNTIME_CACHE = `${CACHE_PREFIX}-runtime-${VERSION}`;
const PACK_CACHE = `${CACHE_PREFIX}-offline-pack-${VERSION}`;
const ROOT = self.registration.scope;
const absolute = (path) => new URL(path, ROOT).href;

const CORE_ASSETS = [
  "index.html",
  "offline/index.html",
  "oggi/index.html",
  "calendario/index.html",
  "calendario/modifica/index.html",
  "calendario/gestisci/index.html",
  "calendario/componi/index.html",
  "preparazioni/index.html",
  "cerca/index.html",
  "piano/index.html",
  "ricette/index.html",
  "ricette/studio/index.html",
  "ricette/programma/index.html",
  "ingredienti/index.html",
  "spesa/index.html",
  "spesa/intervallo/index.html",
  "spesa/cicli/index.html",
  "preferenze/index.html",
  "strumenti/index.html",
  "progetto/index.html",
  "manifest.webmanifest",
  "assets/favicon.svg",
  "assets/brand/brand-mark.svg",
  "assets/illustrations/offline-ready.svg",
  "assets/icons.svg",
  "assets/icons/icon-192.png",
  "assets/icons/icon-512.png",
  "assets/icons/icon-maskable-512.png",
  "assets/icons/apple-touch-icon.png",
  "assets/css/styles.css",
  "assets/js/calendar-core.js",
  "assets/js/site-state.js",
  "assets/js/operations-core.js",
  "assets/js/v5-day-types.js",
  "assets/js/v5-preferences-core.js",
  "assets/js/v5-planning-core.js",
  "assets/js/v5-db.js",
  "assets/js/v5-backup.js",
  "assets/js/v5-ingredients-core.js",
  "assets/js/v5-ingredient-store.js",
  "assets/js/v5-ingredients.js",
  "assets/js/v5-recipes-core.js",
  "assets/js/v5-recipe-store.js",
  "assets/js/v5-recipes.js",
  "assets/js/v5-plan-core.js",
  "assets/js/v5-plan-store.js",
  "assets/js/v5-plan.js",
  "assets/js/v5-plan-calendar.js",
  "assets/js/v5-composer-core.js",
  "assets/js/v5-composer-store.js",
  "assets/js/v5-composer.js",
  "assets/js/v5-day-manager.js",
  "assets/js/v5-preferences.js",
  "assets/js/v5-balance.js",
  "assets/js/v5-recipe-scheduler.js",
  "assets/js/v5-effective-core.js",
  "assets/js/v5-effective-store.js",
  "assets/js/v5-effective-pages.js",
  "assets/js/v5-tools.js",
  "assets/js/app.js",
  "assets/js/calendar.js",
  "assets/js/prep.js",
  "assets/js/shopping-range.js",
  "assets/js/search.js",
  "assets/js/tools.js",
  "assets/js/pwa.js",
  "data/calendar.json",
  "data/plan.json",
  "data/recipes.json",
  "data/shopping.json",
  "data/shopping-range.json",
  "data/search-index.json",
  "data/build-meta.json",
  "data/v5/base-dataset-manifest.json",
  "data/v5/ingredients.base.v1.json",
  "data/v5/recipes.base.v1.json",
  "data/v5/plan-template.base.v1.json",
  "data/offline-assets.json"
];

async function cacheOne(cache, path, options = {}) {
  const request = new Request(absolute(path), { cache: options.reload ? "reload" : "default" });
  const response = await fetch(request);
  if (!response.ok) throw new Error(`${response.status} ${path}`);
  await cache.put(request, response.clone());
  return response;
}

async function cacheCore() {
  const cache = await caches.open(CORE_CACHE);
  const failures = [];
  for (const path of CORE_ASSETS) {
    try { await cacheOne(cache, path, { reload: true }); }
    catch (error) { failures.push({ path, error: String(error) }); }
  }
  if (failures.length) {
    await caches.delete(CORE_CACHE);
    throw new Error(`Installazione annullata: ${failures.length} risorse core non disponibili`);
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(cacheCore());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter((name) => name.startsWith(`${CACHE_PREFIX}-`) && ![CORE_CACHE, RUNTIME_CACHE, PACK_CACHE].includes(name))
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

async function networkFirst(request, fallbackPath = "offline/index.html") {
  const cache = await caches.open(RUNTIME_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch {
    return (await cache.match(request))
      || (await caches.match(request))
      || (await caches.match(request, { ignoreSearch: true }))
      || (await caches.match(absolute(fallbackPath)))
      || new Response("TataDiet non è disponibile offline per questa pagina.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await caches.match(request);
  const update = fetch(request).then(async (response) => {
    if (response.ok) await cache.put(request, response.clone());
    return response;
  }).catch(() => null);
  return cached || update || Response.error();
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(RUNTIME_CACHE);
    await cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(new URL(ROOT).pathname)) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
    return;
  }
  if (url.pathname.includes("/data/") || url.pathname.endsWith(".json")) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }
  if (/\.(?:css|js|svg|png|webp|ico|webmanifest)$/i.test(url.pathname)) {
    event.respondWith(cacheFirst(request));
  }
});

async function postToClients(message) {
  const clients = await self.clients.matchAll({ includeUncontrolled: true, type: "window" });
  clients.forEach((client) => client.postMessage(message));
}

async function offlineManifest() {
  const response = await fetch(absolute("data/offline-assets.json"), { cache: "no-store" });
  if (!response.ok) throw new Error(`Manifest offline HTTP ${response.status}`);
  return response.json();
}

async function downloadOfflinePack() {
  const manifest = await offlineManifest();
  const cache = await caches.open(PACK_CACHE);
  const assets = manifest.assets || [];
  let done = 0;
  let failed = 0;
  await postToClients({ type: "OFFLINE_PACK_PROGRESS", state: "start", done, failed, total: assets.length, bytes: manifest.total_bytes || 0 });
  for (const path of assets) {
    try {
      await cacheOne(cache, path);
    } catch (error) {
      failed += 1;
      console.warn("Risorsa offline non memorizzata", path, error);
    }
    done += 1;
    if (done % 8 === 0 || done === assets.length) {
      await postToClients({ type: "OFFLINE_PACK_PROGRESS", state: "progress", done, failed, total: assets.length, bytes: manifest.total_bytes || 0 });
    }
  }
  await postToClients({ type: "OFFLINE_PACK_PROGRESS", state: "complete", done, failed, total: assets.length, bytes: manifest.total_bytes || 0 });
}

async function cacheStatus() {
  const core = await caches.open(CORE_CACHE);
  const runtime = await caches.open(RUNTIME_CACHE);
  const pack = await caches.open(PACK_CACHE);
  const [coreKeys, runtimeKeys, packKeys] = await Promise.all([core.keys(), runtime.keys(), pack.keys()]);
  return { version: VERSION, core: coreKeys.length, runtime: runtimeKeys.length, pack: packKeys.length, total: new Set([...coreKeys, ...runtimeKeys, ...packKeys].map((r) => r.url)).size };
}

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "SKIP_WAITING") {
    self.skipWaiting();
    return;
  }
  if (data.type === "DOWNLOAD_OFFLINE_PACK") {
    event.waitUntil(downloadOfflinePack());
    return;
  }
  if (data.type === "CLEAR_OFFLINE_PACK") {
    event.waitUntil((async () => {
      await Promise.all([caches.delete(PACK_CACHE), caches.delete(RUNTIME_CACHE)]);
      await postToClients({ type: "OFFLINE_PACK_CLEARED" });
    })());
    return;
  }
  if (data.type === "GET_CACHE_STATUS") {
    event.waitUntil((async () => {
      const status = await cacheStatus();
      event.source?.postMessage({ type: "CACHE_STATUS", status });
    })());
  }
});
