import { readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const root = process.cwd();
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

const staticRoutePaths = getStaticWebsiteRoutePaths();
const routesToCheck = routeLimit
  ? staticRoutePaths.slice(0, routeLimit)
  : staticRoutePaths;

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
    .filter((path) => !path.startsWith("/api/"))
    .sort((a, b) => a.localeCompare(b));

  return [...new Set([...requiredPaths, ...discovered])];
}

function isIgnoredRequest(url) {
  return (
    url.endsWith("/favicon.ico") ||
    url.includes("/.well-known/appspecific/com.chrome.devtools")
  );
}

function isIgnoredConsole(message) {
  const text = message.text();
  return (
    text.includes("Download the React DevTools") ||
    text.includes("Hydration failed because the server rendered HTML didn't match")
  );
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

  page.on("console", (message) => {
    if (message.type() === "error" && !isIgnoredConsole(message)) {
      failures.push(`console error: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => {
    failures.push(`page error: ${error.message}`);
  });
  page.on("requestfailed", (request) => {
    if (!isIgnoredRequest(request.url())) {
      failures.push(
        `request failed: ${request.method()} ${request.url()} ${request.failure()?.errorText ?? ""}`,
      );
    }
  });
  page.on("response", (response) => {
    const status = response.status();
    const url = response.url();
    if (status >= 500 && !isIgnoredRequest(url)) {
      failures.push(`server response ${status}: ${url}`);
    }
  });

  try {
    for (const path of routesToCheck) {
      await checkRoute(page, path);
      if (failures.length > 0) break;
    }

    if (failures.length > 0) {
      throw new Error(failures.slice(0, 10).join("\n"));
    }

    console.log(`Website browser smoke passed: ${routesToCheck.length} routes checked.`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(`Website browser smoke failed:\n${error.stack ?? error.message}`);
  process.exit(1);
});
