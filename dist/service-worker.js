const CACHE_NAME = "dabimas-data-v11";

const FACTOR_ICON_PATHS = Array.from({ length: 12 }, (_, index) => {
  const code = String(index + 1).padStart(2, "0");
  return `static/img/icn/icn_factor_${code}.png`;
});

const CATEGORY_ICON_PATHS = [
  "Ro",
  "Ne",
  "Ns",
  "Na",
  "Ha",
  "St",
  "He",
  "Te",
  "Ph",
  "Ma",
  "Hi",
  "Sw",
  "Fa",
  "To",
  "Ec"
].map((code) => `static/img/category/${code}.png`);

const CORE_PATHS = [
  "./",
  "index.html",
  "manifest.json",
  "json/horselist.json",
  "json/factor.json",
  "static/favicon.ico",
  "static/apple-touch-icon-48x48.png",
  "static/apple-touch-icon-96x96.png",
  "static/apple-touch-icon-144x144.png",
  "static/apple-touch-icon-180x180.png",
  "static/apple-touch-icon-192x192.png",
  "static/apple-touch-icon-384x384.png",
  "static/img/reset.png",
  ...FACTOR_ICON_PATHS,
  ...CATEGORY_ICON_PATHS
];

const scopedUrl = (path) => new URL(path, self.registration.scope).toString();

const isSameOrigin = (url) => url.origin === self.location.origin;

const putInCache = async (request, response) => {
  if (!response || response.status !== 200) {
    return;
  }

  const cache = await caches.open(CACHE_NAME);
  await cache.put(request, response.clone());
};

const cacheUrl = async (url) => {
  try {
    const request = new Request(url, { cache: "reload" });
    const response = await fetch(request);
    await putInCache(request, response);
    return response;
  } catch {
    // Optional precache entries should not fail the install.
    return undefined;
  }
};

const extractLocalAssets = (html) => {
  const urls = new Set();
  const pattern = /\b(?:href|src)="([^"]+)"/g;

  for (const match of html.matchAll(pattern)) {
    const value = match[1];
    if (!value || value.startsWith("http:") || value.startsWith("https:")) {
      continue;
    }
    urls.add(new URL(value, self.registration.scope).toString());
  }

  return [...urls];
};

const extractCssAssets = async (cssUrl, response) => {
  if (!response) {
    return [];
  }

  const css = await response.clone().text();
  const urls = new Set();
  const pattern = /url\((['"]?)([^'")]+)\1\)/g;

  for (const match of css.matchAll(pattern)) {
    const value = match[2];
    if (
      !value ||
      value.startsWith("data:") ||
      value.startsWith("http:") ||
      value.startsWith("https:")
    ) {
      continue;
    }
    urls.add(new URL(value, cssUrl).toString());
  }

  return [...urls];
};

const precache = async () => {
  const cache = await caches.open(CACHE_NAME);
  const indexRequest = new Request(scopedUrl("index.html"), { cache: "reload" });
  const indexResponse = await fetch(indexRequest);

  if (indexResponse.ok) {
    await cache.put(indexRequest, indexResponse.clone());
    await cache.put(scopedUrl("./"), indexResponse.clone());

    const html = await indexResponse.text();
    const htmlAssets = extractLocalAssets(html);
    const cachedAssets = await Promise.all(
      htmlAssets.map(async (assetUrl) => ({
        assetUrl,
        response: await cacheUrl(assetUrl)
      }))
    );
    const cssAssets = await Promise.all(
      cachedAssets
        .filter(({ assetUrl }) => new URL(assetUrl).pathname.endsWith(".css"))
        .map(({ assetUrl, response }) => extractCssAssets(assetUrl, response))
    );
    await Promise.all(cssAssets.flat().map(cacheUrl));
  }

  await Promise.all(CORE_PATHS.map((path) => cacheUrl(scopedUrl(path))));
};

self.addEventListener("install", (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((cacheName) => cacheName !== CACHE_NAME)
            .map((cacheName) => caches.delete(cacheName))
        )
      )
      .then(() => self.clients.claim())
  );
});

const networkFirst = async (request) => {
  try {
    const response = await fetch(request);
    await putInCache(request, response);
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) {
      return cached;
    }
    throw new Error(`No cached response for ${request.url}`);
  }
};

const staleWhileRevalidate = async (request) => {
  const cached = await caches.match(request);
  const fetchAndCache = fetch(request)
    .then(async (response) => {
      await putInCache(request, response);
      return response;
    })
    .catch(() => undefined);

  if (cached) {
    return cached;
  }

  return (await fetchAndCache) || Response.error();
};

const navigationFallback = async (request) => {
  try {
    const response = await fetch(request);
    await putInCache(scopedUrl("./"), response);
    return response;
  } catch {
    const cachedRoot = await caches.match(scopedUrl("./"));
    const cachedIndex = await caches.match(scopedUrl("index.html"));
    return cachedRoot || cachedIndex || Response.error();
  }
};

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);
  if (!isSameOrigin(url)) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(navigationFallback(request));
    return;
  }

  if (
    url.pathname.endsWith("/json/horselist.json") ||
    url.pathname.endsWith("/json/factor.json")
  ) {
    event.respondWith(networkFirst(request));
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
});
