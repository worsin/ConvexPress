// Drive the real ConvexPress Electron app (dev renderer on 4105, worker fleet
// through the SOCKS tunnel) and exercise the local storefront runner.
//
//   printf '%s\n' "$CREDS_JSON" | node electron-runner.mjs <scenario> [--shots DIR] [--keep]
//
// scenarios:
//   preview   — open the environment menu, "Open local preview", wait for the
//               storefront, screenshot, then open Local storefronts dialog.
//   view      — "View website" (obeys site address; starts server when local).
//   stop      — stop all local servers via the dialog.
import { mkdtemp, mkdir, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const admin = "/Users/worsin/Development/ConvexPress/ConvexPress-Admin";
const desktopRoot = join(admin, "packages/desktop");
const bunModules = join(admin, "node_modules/.bun");
const scenario = process.argv[2] ?? "preview";
const shotsFlag = process.argv.indexOf("--shots");
const shots = resolve(shotsFlag > -1 ? process.argv[shotsFlag + 1] : "./shots-runner");
const keep = process.argv.includes("--keep");
const CONTROL = "http://192.168.1.246:4720";
const CONTROL_SITE = "http://192.168.1.246:4721";

async function bunPkg(prefix, rel) {
  const entries = (await readdir(bunModules)).filter((e) => e.startsWith(prefix)).sort();
  if (!entries.length) throw new Error(`missing ${prefix}`);
  return join(bunModules, entries.at(-1), rel);
}

async function readStdinJson() {
  let input = "";
  for await (const chunk of process.stdin) {
    input += chunk;
    if (input.includes("\n")) break;
  }
  return input.trim() ? JSON.parse(input.trim()) : {};
}

const creds = await readStdinJson();
await mkdir(shots, { recursive: true });
const { _electron } = await import(
  pathToFileURL(await bunPkg("playwright@", "node_modules/playwright/index.mjs")).href
);
const electronExecutable = await bunPkg(
  "electron@",
  "node_modules/electron/dist/Electron.app/Contents/MacOS/Electron",
);

const profile = await mkdtemp(join(tmpdir(), "convexpress-runner-"));
const userData = join(profile, "-dev");
await mkdir(userData, { recursive: true });
await writeFile(
  join(userData, "convexpress-config.json"),
  JSON.stringify({ setupComplete: true, mode: "existing", convexUrl: CONTROL, convexSiteUrl: CONTROL_SITE }),
);

const env = {
  PATH: process.env.PATH,
  HOME: process.env.HOME,
  TMPDIR: process.env.TMPDIR,
  USER: process.env.USER,
  LANG: process.env.LANG ?? "en_US.UTF-8",
  CONVEXPRESS_DESKTOP_DEV: "1",
  CONVEXPRESS_DESKTOP_DEV_URL: "http://127.0.0.1:4105",
  CONVEXPRESS_WEBSITE_REPO: "/Users/worsin/Development/ConvexPress/ConvexPress-Website",
  // Storefront processes on this Mac reach the worker through the SSH tunnel.
  CONVEXPRESS_SITE_ORIGIN_MAP: JSON.stringify({
    "http://192.168.1.246:4820": "http://127.0.0.1:14820",
    "http://192.168.1.246:4821": "http://127.0.0.1:14821",
    "http://192.168.1.246:4830": "http://127.0.0.1:14830",
    "http://192.168.1.246:4831": "http://127.0.0.1:14831",
    "http://192.168.1.246:4840": "http://127.0.0.1:14840",
    "http://192.168.1.246:4841": "http://127.0.0.1:14841",
  }),
  CONVEXPRESS_ACCEPTANCE_CONTROL_ORIGIN: CONTROL,
  CONVEXPRESS_ACCEPTANCE_CONTROL_SITE_ORIGIN: CONTROL_SITE,
  CONVEXPRESS_ACCEPTANCE_SITE_ALPHA_ORIGIN: "http://192.168.1.246:4820",
  CONVEXPRESS_ACCEPTANCE_SITE_ALPHA_SITE_ORIGIN: "http://192.168.1.246:4821",
  CONVEXPRESS_ACCEPTANCE_SITE_BETA_ORIGIN: "http://192.168.1.246:4830",
  CONVEXPRESS_ACCEPTANCE_SITE_BETA_SITE_ORIGIN: "http://192.168.1.246:4831",
  CONVEXPRESS_ACCEPTANCE_SITE_GAMMA_ORIGIN: "http://192.168.1.246:4840",
  CONVEXPRESS_ACCEPTANCE_SITE_GAMMA_SITE_ORIGIN: "http://192.168.1.246:4841",
};

const errors = [];
let app;
const started = Date.now();
const log = (...a) => console.log(`[${((Date.now() - started) / 1000).toFixed(1)}s]`, ...a);

async function shot(page, name) {
  const file = join(shots, `${name}.png`);
  await page.screenshot({ path: file, type: "png" });
  log("shot", name);
}

async function settle(page, ms = 1200) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await new Promise((r) => setTimeout(r, ms));
}

async function signIn(page) {
  const trigger = page.getByRole("button", { name: "Switch website" });
  if (await trigger.isVisible().catch(() => false)) return;
  await page.getByRole("textbox", { name: /email/i }).fill(creds.email);
  await page.getByLabel(/^password$/i).fill(creds.password);
  await page.getByRole("button", { name: /^continue$/i }).click();
  await trigger.waitFor({ state: "visible", timeout: 30_000 });
}

async function openEnvMenu(page) {
  await page.getByRole("button", { name: "Environment options" }).click();
  await page.getByRole("menu").waitFor({ state: "visible", timeout: 10_000 });
}

async function waitForToast(page, pattern, timeout = 200_000) {
  await page.getByText(pattern).first().waitFor({ state: "visible", timeout });
}

try {
  app = await _electron.launch({
    executablePath: electronExecutable,
    args: [`--user-data-dir=${profile}`, "--proxy-server=socks5://127.0.0.1:17890", desktopRoot],
    cwd: desktopRoot,
    env,
    timeout: 60_000,
  });
  const page = await app.firstWindow();
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("dialog", (d) => void d.dismiss().catch(() => {}));
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  await page.waitForLoadState("domcontentloaded");
  await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    win.setSize(1440, 900);
    win.center();
  });
  await settle(page, 1500);
  await signIn(page);
  await settle(page, 2500);
  await shot(page, "01-signed-in");

  if (scenario === "preview" || scenario === "view") {
    await openEnvMenu(page);
    await shot(page, "02-env-menu");
    const item = scenario === "preview"
      ? page.getByRole("menuitem", { name: /Open local preview/ })
      : page.getByRole("menuitem", { name: /View website/ });
    await item.click();
    await waitForToast(page, /running at http:\/\/127\.0\.0\.1:\d+|Could not|checkout is not configured|exited|did not answer|stopped before|No storefront|only be controlled/i);
    await settle(page, 800);
    await shot(page, "03-after-launch");
    const toastText = await page.locator("[data-sonner-toast]").allTextContents().catch(() => []);
    log("toast:", toastText.join(" | "));
    await openEnvMenu(page);
    await page.getByRole("menuitem", { name: /Local storefronts/ }).click();
    await page.getByRole("dialog").waitFor({ state: "visible", timeout: 10_000 });
    await settle(page, 800);
    await shot(page, "04-storefronts-dialog");
    const rows = await page.getByRole("dialog").locator("li").allTextContents();
    log("processes:", JSON.stringify(rows));
    const urls = rows.join(" ").match(/http:\/\/127\.0\.0\.1:\d+/g) ?? [];
    for (const url of new Set(urls)) {
      const res = await fetch(url).catch((e) => ({ status: `ERR ${e.message}` }));
      log("probe", url, res.status);
      if (res.text) {
        const html = await res.text();
        const m = html.match(/window\.__CONVEXPRESS_SITE__=(\{.*?\});/);
        log("runtime config:", m ? m[1] : "(not found)");
      }
    }
    // Click first row to load logs
    await page.getByRole("dialog").locator("li button").first().click().catch(() => {});
    await settle(page, 1800);
    await shot(page, "05-storefront-logs");
    if (!keep) {
      for (const btn of await page.getByRole("dialog").getByRole("button", { name: /^Stop / }).all()) {
        await btn.click().catch(() => {});
        await settle(page, 600);
      }
      await shot(page, "06-stopped");
    }
  }


  if (scenario === "demo") {
    // Three storefronts from one checkout: Northstar Live, Northstar Staging, Ridgeline Live.
    const viewWebsite = async (label) => {
      await openEnvMenu(page);
      await page.getByRole("menuitem", { name: /View website/ }).click();
      await waitForToast(page, /running at http:\/\/127\.0\.0\.1:\d+|Could not|exited|did not answer|stopped before|No storefront/i, 240_000);
      const toasts = await page.locator("[data-sonner-toast]").allTextContents().catch(() => []);
      log(label, "toast:", toasts.join(" | "));
      await settle(page, 1000);
    };
    const pickWebsite = async (needle, optionPattern) => {
      await page.getByRole("button", { name: "Switch website" }).click();
      const dialog = page.getByRole("dialog", { name: "Switch website" });
      await dialog.getByRole("combobox", { name: "Search websites" }).fill(needle);
      await dialog.getByRole("option", { name: optionPattern }).first().click();
      await settle(page, 5000);
    };
    await pickWebsite("Northstar", /Northstar Coffee/);
    const envGroupFirst = page.getByRole("group", { name: "Environment" }).first();
    await envGroupFirst.getByRole("button", { name: /Live/ }).click().catch(() => {});
    await settle(page, 3000);
    await viewWebsite("northstar-live");
    await shot(page, "10-northstar-live-launched");
    // Staging of the same site
    const envGroup = page.getByRole("group", { name: "Environment" }).first();
    await envGroup.getByRole("button", { name: /Staging/ }).click();
    await settle(page, 4000);
    await viewWebsite("northstar-staging");
    await shot(page, "11-northstar-staging-launched");
    // Ridgeline Cycles via the site switcher
    await pickWebsite("Ridgeline", /Ridgeline Cycles/);
    await shot(page, "12-ridgeline-selected");
    await viewWebsite("ridgeline-live");
    await shot(page, "13-ridgeline-launched");
    await openEnvMenu(page);
    await page.getByRole("menuitem", { name: /Local storefronts/ }).click();
    await page.getByRole("dialog").waitFor({ state: "visible", timeout: 10_000 });
    await settle(page, 1500);
    await shot(page, "14-three-storefronts");
    const rows = await page.getByRole("dialog").locator("li").allTextContents();
    log("processes:", JSON.stringify(rows));
    for (const url of ["http://127.0.0.1:4201", "http://127.0.0.1:4202", "http://127.0.0.1:4203"]) {
      const res = await fetch(url + "/products").catch((e) => ({ status: "ERR " + e.message, text: null }));
      const html = res.text ? await res.text() : "";
      const title = (html.match(/<title>([^<]*)<\/title>/) || [])[1];
      log("probe", url, res.status, title);
    }
    await page.keyboard.press("Escape");
    await settle(page, 500);
    // Admin settings page for the assistant
    await page.goto("http://127.0.0.1:4105/settings/shop-assistant").catch(() => {});
    await settle(page, 4000);
    await shot(page, "15-settings-shop-assistant");
  }

  if (scenario === "settings") {
    await page.evaluate(() => { window.location.hash = "#/settings/shop-assistant"; });
    await settle(page, 5000);
    await shot(page, "20-settings-shop-assistant");
    const heading = await page.getByRole("heading", { name: /Shop assistant/ }).first().textContent().catch(() => null);
    log("settings heading:", heading);
    await page.getByRole("button", { name: /Settings/ }).first().click().catch(() => {});
    await settle(page, 1500);
    await shot(page, "21-settings-nav");
  }

  if (scenario === "stop") {
    await openEnvMenu(page);
    await page.getByRole("menuitem", { name: /Local storefronts/ }).click();
    await page.getByRole("dialog").waitFor({ state: "visible" });
    for (const btn of await page.getByRole("dialog").getByRole("button", { name: /^Stop / }).all()) {
      await btn.click().catch(() => {});
      await settle(page, 600);
    }
    await shot(page, "stopped");
  }
} catch (error) {
  log("FAILED", error?.stack ?? error);
  process.exitCode = 1;
} finally {
  log("renderer errors:", errors.length ? errors : "none");
  if (app && !keep) {
    await app.evaluate(({ app: a }) => a.exit(0)).catch(() => {});
  } else if (app && keep) {
    log("keeping Electron open (--keep)");
    await new Promise(() => {});
  }
}
