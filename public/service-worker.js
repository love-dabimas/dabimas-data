const CACHE_NAME = "dabimas-data-v11";

// 因子アイコンは連番なので、precache 対象をプログラムで生成する。
const FACTOR_ICON_PATHS = Array.from({ length: 12 }, (_, index) => {
  const code = String(index + 1).padStart(2, "0");
  return `static/img/icn/icn_factor_${code}.png`;
});

// 親系統バッジ画像も同様に一覧化しておく。
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

// 画面の初回表示に必須なファイルをここで定義して install 時に温める。
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

// scope 配下の相対パスを service worker 基準の絶対 URL に直す。
const scopedUrl = (path) => new URL(path, self.registration.scope).toString();

// 他オリジンのリクエストはこの worker の担当外にする。
const isSameOrigin = (url) => url.origin === self.location.origin;

// 正常応答だけを cache へ保存し、エラー応答は残さない。
const putInCache = async (request, response) => {
  if (!response || response.status !== 200) {
    return;
  }

  const cache = await caches.open(CACHE_NAME);
  await cache.put(request, response.clone());
};

// 任意 URL を「取れたら cache へ入れる」という安全な補助関数。
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

// index.html からローカル配信の script / link / img を抜き出す。
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

// CSS 内の url(...) も拾って、フォントや画像の取りこぼしを防ぐ。
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

// install 時に HTML 本体、そこから参照される asset、固定ファイル群をまとめて cache する。
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

// 新しい worker が入ったら即座に待機を抜けて次の activate へ進む。
self.addEventListener("install", (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

// activate 時には古い版 cache を消し、現在ページも新 worker 配下へ取り込む。
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

// JSON のように鮮度が大事なものは network-first で取り、失敗時だけ cache に戻す。
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

// 静的 asset はまず cache を返し、裏で新しい版を取りに行く。
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

// 画面遷移は index.html へフォールバックできるよう特別扱いする。
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

  // GET 以外の変更系リクエストは browser 標準処理へ任せる。
  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);
  if (!isSameOrigin(url)) {
    return;
  }

  // SPA の画面遷移は index.html を返せるよう専用 fallback を通す。
  if (request.mode === "navigate") {
    event.respondWith(navigationFallback(request));
    return;
  }

  // 検索データ JSON は更新を拾いやすくするため network-first。
  if (
    url.pathname.endsWith("/json/horselist.json") ||
    url.pathname.endsWith("/json/factor.json")
  ) {
    event.respondWith(networkFirst(request));
    return;
  }

  // それ以外の静的 asset は cache 優先で体感を軽くする。
  event.respondWith(staleWhileRevalidate(request));
});
