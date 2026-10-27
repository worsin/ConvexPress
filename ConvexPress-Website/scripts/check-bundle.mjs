import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";

const clientAssetsDir = path.resolve("dist/client/assets");
const maxChunkBytes = Number.parseInt(process.env.BUNDLE_MAX_CHUNK_BYTES ?? "550000", 10);
const maxMainBytes = Number.parseInt(process.env.BUNDLE_MAX_MAIN_BYTES ?? "300000", 10);

// Run from apps/web after `vite build` (bun run check:bundle). Limits are bytes; sizes print in KiB.
function formatBytes(bytes) {
  return `${(bytes / 1024).toFixed(2)} KiB`;
}

const assets = await readdir(clientAssetsDir);
const jsAssets = await Promise.all(
  assets
    .filter((file) => file.endsWith(".js"))
    .map(async (file) => {
      const filePath = path.join(clientAssetsDir, file);
      const details = await stat(filePath);
      return { file, size: details.size };
    }),
);

jsAssets.sort((a, b) => b.size - a.size);

const largestChunk = jsAssets[0];
const mainChunk = jsAssets.find(({ file }) => file.startsWith("main-"));
const failures = [];

if (!largestChunk) {
  failures.push("No client JavaScript chunks were found in dist/client/assets.");
}

if (largestChunk && largestChunk.size > maxChunkBytes) {
  failures.push(
    `Largest client chunk ${largestChunk.file} is ${formatBytes(largestChunk.size)}; limit is ${formatBytes(maxChunkBytes)}.`,
  );
}

if (mainChunk && mainChunk.size > maxMainBytes) {
  failures.push(
    `Main client chunk ${mainChunk.file} is ${formatBytes(mainChunk.size)}; limit is ${formatBytes(maxMainBytes)}.`,
  );
}

console.log("Client chunk summary:");
for (const asset of jsAssets.slice(0, 10)) {
  console.log(`- ${asset.file}: ${formatBytes(asset.size)}`);
}

// ─── Route budgets ─────────────────────────────────────────────────────────
// What a first visit to a route downloads before it can run: the JavaScript
// the server tells the browser to preload for the route and every layout
// above it (TanStack Start's manifest), gzipped. Clerk's own script comes from
// its CDN and isn't counted. Storefront code never preloads on a marketing
// page: the cart, product cards and pricing load only where the storefront is
// on (components/layout/HeaderCart.tsx, components/commerce/LazyCartDrawer.ts).
const STOREFRONT_CHUNK = /\/(?:chrome\.cartDrawer|CartDrawer|cartLine|useCart|ProductMiniCard|RelatedProducts|useProductCardPricing|useCommerceSessionToken|HeaderCart)-[\w-]+\.js$/;
const ROUTE_BUDGETS = [
  // The public form page carries signups, including paid ones: no storefront code.
  { route: "/_marketing/forms/$slug", maxGzipBytes: Number.parseInt(process.env.BUNDLE_FORM_ROUTE_GZIP_BYTES ?? "600000", 10), noStorefront: true },
  // A page loads a block family's live host (forms, polls, the cart...) only when
  // one of its blocks is on the page (block-public/live-hosts.tsx): no storefront.
  { route: "/_marketing/", maxGzipBytes: Number.parseInt(process.env.BUNDLE_PAGE_ROUTE_GZIP_BYTES ?? "625000", 10), noStorefront: true },
];

async function readStartManifest() {
  const serverAssets = path.resolve("dist/server/assets");
  const file = (await readdir(serverAssets)).find((name) => name.startsWith("_tanstack-start-manifest"));
  if (!file) return null;
  const source = await readFile(path.join(serverAssets, file), "utf8");
  return JSON.parse(source.slice(source.indexOf("({") + 1, source.lastIndexOf("})") + 1));
}

const manifest = await readStartManifest();
if (!manifest?.routes) {
  failures.push("The TanStack Start manifest (dist/server/assets/_tanstack-start-manifest_*.js) wasn't found or has no routes.");
} else {
  const parentOf = new Map();
  for (const [id, entry] of Object.entries(manifest.routes)) {
    for (const child of entry.children ?? []) parentOf.set(child, id);
  }
  console.log("\nRoute budgets (preloaded JavaScript, gzipped):");
  for (const budget of ROUTE_BUDGETS) {
    if (!manifest.routes[budget.route]) {
      failures.push(`Route ${budget.route} isn't in the build's route manifest.`);
      continue;
    }
    const preloads = new Set();
    for (let id = budget.route; id; id = parentOf.get(id)) {
      for (const preload of manifest.routes[id]?.preloads ?? []) preloads.add(preload);
    }
    let gzipBytes = 0;
    for (const preload of preloads) {
      gzipBytes += gzipSync(await readFile(path.resolve("dist/client", `.${preload}`))).length;
    }
    const storefront = [...preloads].filter((preload) => STOREFRONT_CHUNK.test(preload));
    console.log(`- ${budget.route}: ${preloads.size} files, ${formatBytes(gzipBytes)} (limit ${formatBytes(budget.maxGzipBytes)})`);
    if (gzipBytes > budget.maxGzipBytes) {
      failures.push(`${budget.route} preloads ${formatBytes(gzipBytes)} of JavaScript (gzipped); limit is ${formatBytes(budget.maxGzipBytes)}.`);
    }
    if (budget.noStorefront && storefront.length > 0) {
      failures.push(`${budget.route} preloads storefront code: ${storefront.join(", ")}. Load it only where the storefront is on.`);
    }
  }
}

// ─── Server-rendered stylesheets ───────────────────────────────────────────
// A stylesheet a lazily loaded module imports arrives with that module's
// JavaScript, after the server-rendered page shows: the page flashes unstyled.
// Every stylesheet must be linked by the server for some route (the manifest's
// route assets) or linked by a component with ?url (an absolute URL in the
// JavaScript). One that is only a lazy chunk's dependency fails.
if (manifest?.routes) {
  const linked = new Set();
  for (const entry of Object.values(manifest.routes)) {
    for (const asset of entry.assets ?? []) {
      const href = asset?.attrs?.href;
      if (typeof href === "string" && href.endsWith(".css")) linked.add(path.basename(href));
    }
  }
  const scripts = (await Promise.all(jsAssets.map(({ file }) => readFile(path.join(clientAssetsDir, file), "utf8")))).join("\n");
  const urlLinked = (file) => new RegExp(`["'\`](?:https?://[^"'\`]*|/[^"'\`]*)?/assets/${file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'\`]`).test(scripts);
  const lazyOnly = assets.filter((file) => file.endsWith(".css") && !linked.has(file) && !urlLinked(file));
  console.log(`\nStylesheets: ${assets.filter((file) => file.endsWith(".css")).length}, all in the server-rendered page${lazyOnly.length ? " except " + lazyOnly.length : ""}.`);
  // A route's own preloaded chunks can still pull a stylesheet in lazily. On
  // the budgeted routes, every stylesheet they depend on must be linked by the
  // route itself, or that page restyles (and shifts) after its first paint.
  const parentRoute = new Map();
  for (const [id, entry] of Object.entries(manifest.routes)) for (const child of entry.children ?? []) parentRoute.set(child, id);
  for (const budget of ROUTE_BUDGETS) {
    if (!manifest.routes[budget.route]) continue;
    const routeLinked = new Set();
    const preloaded = new Set();
    for (let id = budget.route; id; id = parentRoute.get(id)) {
      for (const asset of manifest.routes[id]?.assets ?? []) {
        const href = asset?.attrs?.href;
        if (typeof href === "string" && href.endsWith(".css")) routeLinked.add(path.basename(href));
      }
      for (const preload of manifest.routes[id]?.preloads ?? []) preloaded.add(path.basename(preload));
    }
    const late = new Set();
    // The entry and the template registry name every lazy surface's stylesheets
    // (dashboard ones too); a route renders few of those, so they don't count here.
    for (const chunk of [...preloaded].filter((name) => !/^(?:main|template-registry)-/.test(name))) {
      const source = await readFile(path.join(clientAssetsDir, chunk), "utf8").catch(() => "");
      for (const [, css] of source.matchAll(/["']assets\/([\w.-]+\.css)["']/g)) if (!routeLinked.has(css)) late.add(css);
    }
    for (const css of late) {
      failures.push(`${budget.route} preloads code that loads ${css}, which the route doesn't link: its page restyles after the first paint. Load it with the route (sdk/block-renderer/critical-styles.ts).`);
    }
  }
  for (const file of lazyOnly) {
    failures.push(
      `${file} reaches the page only with a lazily loaded module's JavaScript, so server-rendered pages show unstyled first. ` +
        "Import it from a module the route loads statically (a pack surface's own stylesheet sits next to it in surfaces/), or link it with ?url.",
    );
  }
}

// ─── The body face at first paint ──────────────────────────────────────────
// A self-hosted font is found only once the stylesheet naming it is parsed,
// which is after the page first paints: the text then reflows into it and the
// page shifts. The body face's Latin file (what page text is set in) must be
// preloaded by the server-rendered page (routes/__root.tsx). The Latin face's
// range starts at U+0000-00FF, which minifiers write as U+??.
{
  const mainCss = assets.find((file) => /^main-[\w-]+\.css$/.test(file));
  const css = mainCss ? await readFile(path.join(clientAssetsDir, mainCss), "utf8") : "";
  const family = css.match(/--font-sans:\s*["']?([^"',;}]+)/)?.[1]?.trim();
  const faces = family
    ? [...css.matchAll(/@font-face\s*\{[^}]*\}/g)]
        .map(([face]) => face)
        .filter((face) => new RegExp(`font-family:\\s*["']?${family}["']?\\s*[;}]`).test(face) && /unicode-range:\s*U\+(?:0+-0*FF|0*\?\?)(?=[\s,;}])/i.test(face))
    : [];
  const files = faces.map((face) => face.match(/url\(["']?\/assets\/([\w.-]+\.woff2)/)?.[1]).filter((file) => typeof file === "string");
  if (files.length > 0) {
    const serverAssets = path.resolve("dist/server/assets");
    const server = (
      await Promise.all(
        (await readdir(serverAssets)).filter((file) => file.endsWith(".js")).map((file) => readFile(path.join(serverAssets, file), "utf8")),
      )
    ).join("\n");
    console.log(`\nBody face: ${family}, Latin file ${files.join(", ")}${files.every((file) => server.includes(`/assets/${file}`)) ? " preloaded" : ""}.`);
    for (const file of files.filter((file) => !server.includes(`/assets/${file}`))) {
      failures.push(
        `The body face's Latin file (${family}, ${file}) isn't preloaded by the server-rendered page, so it arrives after the first paint and the text reflows. ` +
          "Preload it in routes/__root.tsx (an ?url import of the font file).",
      );
    }
  }
}

if (failures.length > 0) {
  console.error("\nBundle budget check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(
  `\nBundle budget check passed. Largest chunk: ${largestChunk.file} (${formatBytes(largestChunk.size)}).`,
);
