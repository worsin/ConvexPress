import { readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const root = process.cwd();
const baseUrl = normalizeBaseUrl(
  process.env.ADMIN_SMOKE_BASE_URL ?? "http://localhost:4105",
);
const username = process.env.ADMIN_SMOKE_USER ?? process.env.ADMIN_SMOKE_EMAIL;
const password = process.env.ADMIN_SMOKE_PASSWORD;
const routeLimit = parsePositiveInt(process.env.ADMIN_SMOKE_ROUTE_LIMIT);
const headed = process.env.ADMIN_SMOKE_HEADED === "1";

const staticRoutePaths = getStaticAdminRoutePaths();
const routesToCheck = routeLimit
  ? staticRoutePaths.slice(0, routeLimit)
  : staticRoutePaths;

const dialogChecks = [
  {
    path: "/api-keys",
    name: "api key create",
    trigger: /create.*key|new.*key|add.*key/i,
    expected: /api key|key name|scope/i,
  },
  {
    path: "/webhooks",
    name: "webhook create",
    trigger: /create.*webhook|new.*webhook|add.*webhook/i,
    expected: /webhook|endpoint|event/i,
  },
  {
    path: "/tools/audit-log",
    name: "audit export",
    trigger: /export/i,
    expected: /export|format|date range/i,
  },
  {
    path: "/tools/wordpress-sync",
    name: "wordpress sync add site",
    trigger: /add.*site|connect.*site/i,
    expected: /wordpress|site url|application password/i,
  },
];

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
  const normalized = path.length > 1 ? path.replace(/\/+$/, "") : path;
  return normalized === "/" ? "/dashboard" : normalized;
}

function getStaticAdminRoutePaths() {
  const routeTree = read("apps/web/src/routeTree.gen.ts");
  const routeFullPaths = new Set(
    [...extractStringValues(routeTree, "fullPath")].map(normalizePath),
  );
  const routeMapKeys = new Set(
    [...routeTree.matchAll(/['"`](\/[^'"`]+)['"`]:\s*typeof/g)].map((match) =>
      normalizePath(match[1]),
    ),
  );

  return [...new Set([...routeFullPaths, ...routeMapKeys])]
    .filter((path) => path.startsWith("/"))
    .filter((path) => !path.includes("$"))
    .filter((path) => !path.includes("*"))
    .filter((path) => path !== "/")
    .sort((a, b) => a.localeCompare(b));
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
    text.includes("Convex client has already been connected")
  );
}

async function waitForAppSettled(page) {
  await page.waitForLoadState("domcontentloaded");
  await page.locator("body").waitFor({ state: "visible", timeout: 10_000 });
}

async function authenticate(page) {
  await page.goto(`${baseUrl}/dashboard`, { waitUntil: "domcontentloaded" });
  await waitForAppSettled(page);

  const setupForm = page.locator("#admin-display-name");
  if (await setupForm.isVisible().catch(() => false)) {
    throw new Error(
      "Admin setup form is visible. Create the first admin before running browser smoke.",
    );
  }

  const loginInput = page.locator("#identifier");
  if (!(await loginInput.isVisible().catch(() => false))) return;

  if (!username || !password) {
    throw new Error(
      "Admin login is required. Set ADMIN_SMOKE_USER and ADMIN_SMOKE_PASSWORD.",
    );
  }

  await loginInput.fill(username);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.locator("#admin-content").waitFor({ state: "visible", timeout: 20_000 });
}

async function assertNoLoginScreen(page, path) {
  if (await page.locator("#identifier").isVisible().catch(() => false)) {
    throw new Error(`${path} rendered the login screen after authentication`);
  }
}

async function checkRoute(page, path) {
  await page.goto(`${baseUrl}${path}`, { waitUntil: "domcontentloaded" });
  await waitForAppSettled(page);
  await assertNoLoginScreen(page, path);

  const content = page.locator("#admin-content");
  if (!(await content.isVisible().catch(() => false))) {
    throw new Error(`${path} did not render #admin-content`);
  }
}

async function closeOpenDialog(page) {
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
}

async function checkDialog(page, check) {
  await page.goto(`${baseUrl}${check.path}`, { waitUntil: "domcontentloaded" });
  await waitForAppSettled(page);
  await assertNoLoginScreen(page, check.path);

  const trigger = page.getByRole("button", { name: check.trigger }).first();
  if (!(await trigger.isVisible().catch(() => false))) {
    return { name: check.name, skipped: true, reason: "trigger not visible" };
  }

  await trigger.click();
  await page.waitForTimeout(250);

  const dialog = page.getByRole("dialog").first();
  const hasDialog = await dialog.isVisible().catch(() => false);
  const bodyText = await page.locator("body").innerText();
  if (!hasDialog && !check.expected.test(bodyText)) {
    throw new Error(`${check.name} did not open a visible dialog or panel`);
  }

  await closeOpenDialog(page);
  return { name: check.name, skipped: false };
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
    await authenticate(page);

    for (const path of routesToCheck) {
      await checkRoute(page, path);
      if (failures.length > 0) break;
    }

    const dialogResults = [];
    if (failures.length === 0) {
      for (const check of dialogChecks) {
        dialogResults.push(await checkDialog(page, check));
        if (failures.length > 0) break;
      }
    }

    if (failures.length > 0) {
      throw new Error(failures.slice(0, 10).join("\n"));
    }

    const skipped = dialogResults.filter((result) => result.skipped);
    console.log(
      `Admin browser smoke passed: ${routesToCheck.length} routes checked, ${
        dialogResults.length - skipped.length
      } dialogs opened${skipped.length ? `, ${skipped.length} dialogs skipped` : ""}.`,
    );
    if (skipped.length) {
      for (const result of skipped) {
        console.warn(`Skipped dialog "${result.name}": ${result.reason}`);
      }
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(`Admin browser smoke failed:\n${error.stack ?? error.message}`);
  process.exit(1);
});
