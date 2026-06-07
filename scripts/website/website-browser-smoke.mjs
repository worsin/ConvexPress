import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const root = resolveWebsiteAppRoot(process.cwd());
const require = createRequire(join(root, "package.json"));
const { chromium } = require("@playwright/test");
const { ConvexHttpClient } = require("convex/browser");
const { api } = require("@convexpress-website/backend/generated/api");
const { config: loadEnv } = require("dotenv");
loadEnv({ path: join(root, ".env.local") });
loadEnv({ path: join(root, ".env") });
const baseUrl = normalizeBaseUrl(
  process.env.WEBSITE_SMOKE_BASE_URL ?? "http://localhost:4106",
);
const routeLimit = parsePositiveInt(process.env.WEBSITE_SMOKE_ROUTE_LIMIT);
const headed = process.env.WEBSITE_SMOKE_HEADED === "1";

const requiredPaths = [
  "/",
  "/blog",
  "/search",
  "/shop",
  "/products",
  "/categories",
  "/cart",
  "/checkout",
  "/pricing",
  "/help",
  "/help/search",
  "/support",
  "/support/new",
  "/login",
  "/register",
  "/forgot-password",
  "/dashboard",
];

const pluginRouteRequirements = [
  { pluginId: "commerce", prefixes: ["/cart", "/categories", "/checkout", "/products", "/shop"] },
  { pluginId: "commerceBundles", prefixes: ["/bundles"] },
  { pluginId: "commerceDigital", prefixes: ["/dashboard/downloads"] },
  { pluginId: "commerceReturns", prefixes: ["/dashboard/returns"] },
  { pluginId: "commerceReviews", prefixes: ["/dashboard/reviews", "/reviews"] },
  { pluginId: "commerceSubscriptions", prefixes: ["/dashboard/subscriptions", "/pricing", "/signup"] },
  { pluginId: "commerceWishlists", prefixes: ["/dashboard/wishlist", "/wishlist"] },
  { pluginId: "forms", prefixes: ["/forms"] },
  { pluginId: "gallery", prefixes: ["/gallery"] },
  { pluginId: "kb", prefixes: ["/help"] },
  { pluginId: "lms", prefixes: ["/certificates", "/courses", "/dashboard/courses"] },
  { pluginId: "membership", prefixes: ["/dashboard/membership", "/membership"] },
  { pluginId: "recipes", prefixes: ["/recipes"] },
  { pluginId: "tickets", prefixes: ["/support"] },
];

const routeSelection = await getRoutesToCheck();
const routesToCheck = routeLimit
  ? routeSelection.routes.slice(0, routeLimit)
  : routeSelection.routes;

function resolveWebsiteAppRoot(cwd) {
  if (existsSync(join(cwd, "src/routeTree.gen.ts"))) return cwd;
  const monorepoApp = join(cwd, "apps/web");
  if (existsSync(join(monorepoApp, "src/routeTree.gen.ts"))) return monorepoApp;
  const workspaceApp = join(cwd, "ConvexPress-Website/apps/web");
  if (existsSync(join(workspaceApp, "src/routeTree.gen.ts"))) return workspaceApp;
  throw new Error(
    "Unable to locate ConvexPress-Website/apps/web/src/routeTree.gen.ts for website browser smoke.",
  );
}

function normalizeBaseUrl(value) {
  return value.replace(/\/+$/, "");
}

function parsePositiveInt(value) {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

function extractStringValues(source, key) {
  const values = new Set();
  const pattern = new RegExp(`${key}:\\s*["'\`]([^"'\`]+)["'\`]`, "g");
  for (const match of source.matchAll(pattern)) values.add(match[1]);
  return values;
}

function normalizePath(path) {
  return path.length > 1 ? path.replace(/\/+$/, "") : path;
}

function getStaticWebsiteRoutePaths() {
  const routeTree = read("src/routeTree.gen.ts");
  const routeFullPaths = new Set(
    [...extractStringValues(routeTree, "fullPath")].map(normalizePath),
  );
  const routeMapKeys = new Set(
    [...routeTree.matchAll(/['"`](\/[^'"`]+)['"`]:\s*typeof/g)].map((match) =>
      normalizePath(match[1]),
    ),
  );
  const discovered = [...new Set([...routeFullPaths, ...routeMapKeys])]
    .filter((path) => path.startsWith("/"))
    .filter((path) => !path.includes("$"))
    .filter((path) => !path.includes("*"))
    .filter((path) => !path.split("/").some((segment) => segment.startsWith("_")))
    .filter((path) => !path.startsWith("/api/"))
    .sort((a, b) => a.localeCompare(b));

  return [...new Set([...requiredPaths, ...discovered])];
}

async function getRoutesToCheck() {
  const allRoutes = getStaticWebsiteRoutePaths();
  const settings = await getPublicSettings();
  if (!settings) return { routes: allRoutes, skipped: [] };

  const skipped = [];
  const routes = [];
  for (const route of allRoutes) {
    const disabledPluginId = getDisabledPluginForRoute(route, settings);
    if (disabledPluginId) {
      skipped.push({ route, pluginId: disabledPluginId });
    } else {
      routes.push(route);
    }
  }

  return { routes, skipped };
}

async function getPublicSettings() {
  if (!process.env.VITE_CONVEX_URL) return null;
  const client = new ConvexHttpClient(process.env.VITE_CONVEX_URL);
  return await client.query(api.settings.queries.getPublic, {});
}

function getDisabledPluginForRoute(route, settings) {
  for (const requirement of pluginRouteRequirements) {
    if (
      requirement.prefixes.some(
        (prefix) => route === prefix || route.startsWith(`${prefix}/`),
      ) &&
      !isPublicPluginEnabled(requirement.pluginId, settings)
    ) {
      return requirement.pluginId;
    }
  }
  return null;
}

function isPublicPluginEnabled(pluginId, settings) {
  if (!settings) return false;

  const commerceEnabled = settings.plugins?.commerceEnabled === true;

  switch (pluginId) {
    case "commerce":
      return commerceEnabled;
    case "commerceDigital":
      return commerceEnabled && settings.plugins?.commerceDigitalEnabled === true;
    case "commerceReviews":
      return commerceEnabled && settings.plugins?.commerceReviewsEnabled === true;
    case "commerceSubscriptions":
      return (
        commerceEnabled &&
        settings.plugins?.commerceSubscriptionsEnabled === true
      );
    case "commerceWishlists":
      return commerceEnabled && settings.plugins?.commerceWishlistsEnabled === true;
    case "commerceBundles":
      return commerceEnabled && settings.plugins?.commerceBundlesEnabled === true;
    case "commerceReturns":
      return commerceEnabled && settings.plugins?.commerceReturnsEnabled === true;
    case "kb":
      return (
        settings.plugins?.knowledgeBaseEnabled === true ||
        settings.plugins?.kbEnabled === true
      );
    case "tickets":
      return settings.plugins?.ticketsEnabled === true;
    case "recipes":
      return settings.plugins?.recipesEnabled === true;
    case "gallery":
      return settings.plugins?.galleryEnabled === true;
    case "membership":
      return settings.plugins?.membershipEnabled === true;
    case "lms":
      return settings.plugins?.lmsEnabled !== false;
    case "forms":
      return settings.plugins?.formsEnabled === true;
    default:
      return false;
  }
}

function isIgnoredRequest(url) {
  return (
    url.endsWith("/favicon.ico") ||
    url.includes("/.well-known/appspecific/com.chrome.devtools")
  );
}

function isIgnoredRequestFailure(request) {
  const failureText = request.failure()?.errorText ?? "";
  if (failureText === "net::ERR_ABORTED") {
    return true;
  }
  return isIgnoredRequest(request.url());
}

function isIgnoredConsole(message) {
  const text = message.text();
  return (
    text.includes("Download the React DevTools") ||
    text.includes("Hydration failed because the server rendered HTML didn't match") ||
    text.includes("Failed to load resource: the server responded with a status of 404")
  );
}

function isIgnoredPageError(error) {
  return error.message.includes("Hydration failed because the server rendered HTML didn't match");
}

async function waitForAppSettled(page) {
  await page.waitForLoadState("domcontentloaded");
  await page.locator("body").waitFor({ state: "visible", timeout: 10_000 });
}

async function checkRoute(page, path) {
  await page.goto(`${baseUrl}${path}`, { waitUntil: "domcontentloaded" });
  await waitForAppSettled(page);

  const bodyText = (await page.locator("body").innerText()).trim();
  if (bodyText.length === 0) {
    throw new Error(`${path} rendered an empty body`);
  }
}

async function main() {
  const browser = await chromium.launch({ headless: !headed });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const failures = [];
  let currentPath = "";

  page.on("console", (message) => {
    if (message.type() === "error" && !isIgnoredConsole(message)) {
      failures.push(`${currentPath || "(unknown route)"} console error: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => {
    if (!isIgnoredPageError(error)) {
      failures.push(`${currentPath || "(unknown route)"} page error: ${error.message}`);
    }
  });
  page.on("requestfailed", (request) => {
    if (!isIgnoredRequestFailure(request)) {
      failures.push(
        `${currentPath || "(unknown route)"} request failed: ${request.method()} ${request.url()} ${request.failure()?.errorText ?? ""}`,
      );
    }
  });
  page.on("response", (response) => {
    const status = response.status();
    const url = response.url();
    if (
      status >= 400 &&
      response.request().resourceType() === "document" &&
      !isIgnoredRequest(url)
    ) {
      failures.push(`${currentPath || "(unknown route)"} document response ${status}: ${url}`);
    }
    if (status >= 500 && !isIgnoredRequest(url)) {
      failures.push(`${currentPath || "(unknown route)"} server response ${status}: ${url}`);
    }
  });

  try {
    for (const path of routesToCheck) {
      currentPath = path;
      await checkRoute(page, path);
      if (failures.length > 0) break;
    }

    if (failures.length > 0) {
      throw new Error(failures.slice(0, 10).join("\n"));
    }

    console.log(
      `Website browser smoke passed: ${routesToCheck.length} routes checked; ${routeSelection.skipped.length} disabled plugin routes skipped.`,
    );
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(`Website browser smoke failed:\n${error.stack ?? error.message}`);
  process.exit(1);
});
