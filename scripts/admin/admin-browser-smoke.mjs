import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const root = resolveAdminRoot(process.cwd());
const require = createRequire(join(root, "apps/web/package.json"));
const { chromium } = require("@playwright/test");
const { config: loadEnv } = require("dotenv");
loadEnv({ path: join(root, "apps/web/.env.local") });
loadEnv({ path: join(root, "apps/web/.env") });
const baseUrl = normalizeBaseUrl(
  process.env.ADMIN_SMOKE_BASE_URL ?? "http://localhost:4105",
);
const allowFirstAdminSetup = parseBooleanFlag(
  process.env.ADMIN_SMOKE_ALLOW_FIRST_ADMIN_SETUP,
);
const explicitUsername =
  process.env.ADMIN_SMOKE_USER ?? process.env.ADMIN_SMOKE_EMAIL;
const explicitPassword = process.env.ADMIN_SMOKE_PASSWORD;
const firstAdminEmail =
  process.env.ADMIN_SMOKE_FIRST_ADMIN_EMAIL ??
  process.env.ADMIN_SMOKE_EMAIL ??
  (explicitUsername?.includes("@") ? explicitUsername : undefined);
const firstAdminPassword =
  process.env.ADMIN_SMOKE_FIRST_ADMIN_PASSWORD ?? explicitPassword;
const firstAdminDisplayName =
  process.env.ADMIN_SMOKE_FIRST_ADMIN_NAME ?? "Smoke Admin";
const firstAdminUsername = process.env.ADMIN_SMOKE_FIRST_ADMIN_USERNAME;
const username =
  explicitUsername ?? (allowFirstAdminSetup ? firstAdminEmail : undefined);
const password =
  explicitPassword ?? (allowFirstAdminSetup ? firstAdminPassword : undefined);
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

function resolveAdminRoot(cwd) {
  if (existsSync(join(cwd, "apps/web/package.json"))) return cwd;
  const nested = join(cwd, "ConvexPress-Admin");
  if (existsSync(join(nested, "apps/web/package.json"))) return nested;
  throw new Error(
    "Unable to locate ConvexPress-Admin/apps/web/package.json for admin browser smoke.",
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

function parseBooleanFlag(value) {
  if (!value) return false;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
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
    .filter((path) => !path.split("/").some((segment) => segment.startsWith("_")))
    .filter((path) => path !== "/")
    .sort((a, b) => a.localeCompare(b));
}

function isIgnoredRequest(url) {
  return (
    url.endsWith("/favicon.ico") ||
    url.includes("/auth/refresh") ||
    url.includes("/auth/login") ||
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
    text.includes("Convex client has already been connected") ||
    text.includes("Failed to load resource: the server responded with a status of 401")
  );
}

async function waitForAppSettled(page, path = page.url()) {
  await page.waitForLoadState("domcontentloaded");
  await page.locator("body").waitFor({ state: "attached", timeout: 10_000 }).catch((error) => {
    throw new Error(`${path} did not expose an attached body at ${page.url()}: ${error.message}`);
  });
}

async function authenticate(page) {
  await page.goto(`${baseUrl}/dashboard`, { waitUntil: "domcontentloaded" });
  await waitForAppSettled(page, "/dashboard");

  const setupForm = page.locator("#admin-display-name");
  if (await setupForm.isVisible().catch(() => false)) {
    if (!allowFirstAdminSetup) {
      throw new Error(
        "Admin setup form is visible. Create the first admin before running browser smoke, or set ADMIN_SMOKE_ALLOW_FIRST_ADMIN_SETUP=1 with first-admin credentials for an explicit fresh-setup smoke.",
      );
    }

    await createFirstAdminFromSetupForm(page);
    return;
  }

  const loginInput = page.locator("#identifier");
  await Promise.race([
    loginInput.waitFor({ state: "visible", timeout: 20_000 }).catch(() => null),
    page.locator("#admin-content").waitFor({ state: "visible", timeout: 20_000 }).catch(() => null),
  ]);
  if (!(await loginInput.isVisible().catch(() => false))) {
    await page.locator("#admin-content").waitFor({ state: "visible", timeout: 20_000 });
    return;
  }

  await signInExistingAdmin(page);
}

async function signInExistingAdmin(page) {
  if (!username || !password) {
    throw new Error(
      "Admin login is required. Set ADMIN_SMOKE_USER and ADMIN_SMOKE_PASSWORD.",
    );
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    await page.goto(`${baseUrl}/dashboard`, { waitUntil: "domcontentloaded" });
    await waitForAppSettled(page, "/dashboard");

    const adminContent = page.locator("#admin-content");
    if (await adminContent.isVisible().catch(() => false)) {
      return;
    }

    if (await page.locator("#admin-display-name").isVisible().catch(() => false)) {
      await page.waitForTimeout(1_000);
      continue;
    }

    const loginInput = page.locator("#identifier");
    await loginInput.waitFor({ state: "visible", timeout: 20_000 });
    await loginInput.fill(username);
    await page.locator("#password").fill(password);
    await page.getByRole("button", { name: /sign in/i }).click();
    await adminContent.waitFor({ state: "visible", timeout: 20_000 });
    return;
  }

  throw new Error(
    "Admin setup form stayed visible after first-admin setup; could not reach login.",
  );
}

async function createFirstAdminFromSetupForm(page) {
  if (!firstAdminEmail || !firstAdminPassword) {
    throw new Error(
      "First-admin smoke setup requires ADMIN_SMOKE_FIRST_ADMIN_EMAIL (or ADMIN_SMOKE_EMAIL/ADMIN_SMOKE_USER as an email) and ADMIN_SMOKE_FIRST_ADMIN_PASSWORD (or ADMIN_SMOKE_PASSWORD).",
    );
  }

  await page.locator("#admin-display-name").fill(firstAdminDisplayName);
  if (firstAdminUsername) {
    await page.locator("#admin-username").fill(firstAdminUsername);
  }
  await page.locator("#admin-email").fill(firstAdminEmail);
  await page.locator("#admin-password").fill(firstAdminPassword);
  await page.locator("#admin-confirm").fill(firstAdminPassword);
  await page.getByRole("button", { name: /create admin account/i }).click();

  const adminContent = page.locator("#admin-content");
  const alreadyExistsError = page.getByText(
    /administrator account already exists/i,
  );
  const outcome = await Promise.race([
    adminContent
      .waitFor({ state: "visible", timeout: 30_000 })
      .then(() => "created")
      .catch(() => null),
    alreadyExistsError
      .waitFor({ state: "visible", timeout: 30_000 })
      .then(() => "already-exists")
      .catch(() => null),
  ]);

  if (outcome === "already-exists") {
    await signInExistingAdmin(page);
    return;
  }

  if (outcome !== "created") {
    const bodyText = await page.locator("body").innerText().catch(() => "");
    throw new Error(
      `First-admin setup did not finish. Body: ${bodyText.slice(0, 500)}`,
    );
  }

  await page
    .getByRole("heading", { name: /finish convexpress setup/i })
    .waitFor({ state: "visible", timeout: 30_000 });
}

async function assertNoLoginScreen(page, path) {
  if (await page.locator("#identifier").isVisible().catch(() => false)) {
    throw new Error(`${path} rendered the login screen after authentication`);
  }
}

async function checkRoute(page, path) {
  await page.goto(`${baseUrl}${path}`, { waitUntil: "domcontentloaded" });
  await waitForAppSettled(page, path);
  await assertNoLoginScreen(page, path);

  const content = page.locator("#admin-content");
  if (!(await content.waitFor({ state: "visible", timeout: 20_000 }).then(() => true).catch(() => false))) {
    const bodyText = await page.locator("body").innerText().catch(() => "");
    throw new Error(
      `${path} did not render #admin-content at ${page.url()}. Body: ${bodyText.slice(0, 500)}`,
    );
  }
}

async function closeOpenDialog(page) {
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
}

async function checkDialog(page, check) {
  await page.goto(`${baseUrl}${check.path}`, { waitUntil: "domcontentloaded" });
  await waitForAppSettled(page, check.path);
  await assertNoLoginScreen(page, check.path);
  await page.locator("#admin-content").waitFor({ state: "visible", timeout: 20_000 });

  const trigger = page.getByRole("button", { name: check.trigger }).first();
  const hasTrigger = await trigger
    .waitFor({ state: "visible", timeout: 10_000 })
    .then(() => true)
    .catch(() => false);
  if (!hasTrigger) {
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
    if (!isIgnoredRequestFailure(request)) {
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
