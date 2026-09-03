import { mkdtemp, mkdir, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  acceptanceProxyArguments,
  buildElectronAcceptanceEnvironment,
} from "./lib/electron-acceptance-environment.mjs";
import { quitOwnedElectron } from "./lib/process-lifecycle.mjs";
import { loadTestFleetConfig } from "./lib/test-fleet-config.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(scriptDirectory, "..");
const repositoryRoot = resolve(desktopRoot, "../..");
const artifactRoot = resolve(repositoryRoot, "../output/playwright");
const bunModulesRoot = join(repositoryRoot, "node_modules/.bun");
const websiteRendererUrl =
  process.env.CONVEXPRESS_ACCEPTANCE_WEBSITE_RENDERER_ORIGIN ??
  "http://127.0.0.1:4106";

async function resolveBunPackage(prefix, relativeEntry) {
  const entries = await readdir(bunModulesRoot);
  const packageDirectory = entries
    .filter((entry) => entry.startsWith(prefix))
    .sort()
    .at(-1);
  if (!packageDirectory) throw new Error(`Missing installed package: ${prefix}`);
  return join(bunModulesRoot, packageDirectory, relativeEntry);
}

function assertNoHorizontalOverflow(metrics, label) {
  if (metrics.scrollWidth > metrics.clientWidth + 1) {
    throw new Error(`${label} has horizontal overflow: ${JSON.stringify(metrics)}`);
  }
}

async function main() {
  const fleet = loadTestFleetConfig();
  await mkdir(artifactRoot, { recursive: true });
  const playwrightEntry = await resolveBunPackage(
    "playwright@",
    "node_modules/playwright/index.mjs",
  );
  const electronExecutable = await resolveBunPackage(
    "electron@",
    "node_modules/electron/dist/Electron.app/Contents/MacOS/Electron",
  );
  const { _electron } = await import(pathToFileURL(playwrightEntry).href);
  const temporaryProfile = await mkdtemp(
    join(tmpdir(), "convexpress-public-site-electron-acceptance-"),
  );
  const expectedUserData = join(temporaryProfile, "-dev");
  await mkdir(expectedUserData, { recursive: true });
  await writeFile(
    join(expectedUserData, "convexpress-config.json"),
    JSON.stringify({
      setupComplete: true,
      mode: "existing",
      convexUrl: fleet.sites[0].deploymentOrigin,
      convexSiteUrl: fleet.sites[0].siteOrigin,
    }),
    "utf8",
  );

  const launchEnvironment = buildElectronAcceptanceEnvironment(process.env, {
    CONVEXPRESS_DESKTOP_DEV: "1",
    CONVEXPRESS_DESKTOP_DEV_URL: websiteRendererUrl,
  });

  let electronApp;
  let page;
  let phase = "launch-public-website-electron";
  const rendererErrors = [];
  try {
    electronApp = await _electron.launch({
      executablePath: electronExecutable,
      args: [
        `--user-data-dir=${temporaryProfile}`,
        ...acceptanceProxyArguments(),
        desktopRoot,
      ],
      cwd: desktopRoot,
      env: launchEnvironment,
      timeout: 60_000,
    });
    const initialWindow = await electronApp.firstWindow();
    await initialWindow.waitForLoadState("domcontentloaded");
    const publicWindow = electronApp.waitForEvent("window");
    await electronApp.evaluate(async ({ BrowserWindow }, publicUrl) => {
      const shellWindow = BrowserWindow.getAllWindows()[0];
      const previewWindow = new BrowserWindow({
        width: 1280,
        height: 860,
        show: true,
        webPreferences: {
          partition: "convexpress-public-site-acceptance",
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
        },
      });
      await previewWindow.loadURL(publicUrl);
      shellWindow?.destroy();
    }, websiteRendererUrl);
    page = await publicWindow;
    page.on("console", (message) => {
      if (message.type() === "error") rendererErrors.push(message.text());
    });
    page.on("pageerror", (error) => rendererErrors.push(error.message));
    await page.waitForLoadState("domcontentloaded");

    phase = "verify-isolated-site-profile";
    const actualUserData = await electronApp.evaluate(({ app }) => app.getPath("userData"));
    if ((await realpath(actualUserData)) !== (await realpath(expectedUserData))) {
      throw new Error("The public website Electron run did not use its isolated profile.");
    }

    phase = "verify-desktop-public-site";
    await page.locator("main").first().waitFor({ state: "visible", timeout: 30_000 });
    await page.waitForTimeout(1_000);
    const desktopMetrics = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    assertNoHorizontalOverflow(desktopMetrics, "Desktop public website");
    await page.screenshot({
      path: join(artifactRoot, "electron-public-website-desktop.png"),
      type: "png",
      fullPage: true,
    });

    phase = "verify-mobile-public-site";
    await electronApp.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      window.setMinimumSize(320, 568);
      window.setContentSize(390, 844);
    });
    await page.waitForTimeout(500);
    const mobileMetrics = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    assertNoHorizontalOverflow(mobileMetrics, "Mobile public website");
    const openNavigation = page.getByRole("button", { name: "Open navigation menu" });
    await openNavigation.waitFor({ state: "visible", timeout: 10_000 });
    await openNavigation.click();
    await page.waitForTimeout(250);
    const navigationState = await page.evaluate(() => ({
      backdropCount: document.querySelectorAll('[data-slot="mobile-nav-backdrop"]').length,
      ariaModal: document.querySelector('[data-slot="mobile-nav"]')?.getAttribute("aria-modal"),
      backgroundInert: document.querySelector('[data-slot="mobile-nav"]')?.nextElementSibling?.hasAttribute("inert") ?? false,
      bodyOverflow: document.body.style.overflow,
    }));
    if (navigationState.backdropCount !== 1) {
      throw new Error(
        `Mobile navigation state did not open: ${JSON.stringify(navigationState)}`,
      );
    }
    const navigationDialog = page.getByRole("dialog", { name: "Navigation menu" });
    if ((await navigationDialog.getAttribute("aria-modal")) !== "true") {
      throw new Error("Mobile navigation dialog did not enter its modal open state.");
    }
    await page.getByRole("button", { name: "Close navigation menu" }).waitFor({
      state: "visible",
      timeout: 10_000,
    });
    await page.waitForTimeout(400);
    const navigationBounds = await navigationDialog.boundingBox();
    if (!navigationBounds) {
      throw new Error("Mobile navigation dialog has no rendered bounds.");
    }
    const renderedNavigationWidth = Math.min(
      mobileMetrics.clientWidth,
      navigationBounds.x + navigationBounds.width,
    ) - Math.max(0, navigationBounds.x);
    if (renderedNavigationWidth < 250) {
      throw new Error(
        `Mobile navigation did not finish entering the viewport: ${JSON.stringify(navigationBounds)}`,
      );
    }
    await page.screenshot({
      path: join(artifactRoot, "electron-public-website-mobile.png"),
      type: "png",
    });

    if (rendererErrors.length > 0) {
      throw new Error(`Public website renderer errors: ${rendererErrors.join(" | ")}`);
    }
    const result = {
      acceptanceMode: "public-website-electron",
      electronWindow: true,
      isolatedSiteDatabase: true,
      desktopRendered: true,
      mobileRendered: true,
      mobileNavigationOperated: true,
      desktopHorizontalOverflow: false,
      mobileHorizontalOverflow: false,
      rendererErrorCount: 0,
    };
    await writeFile(
      join(artifactRoot, "electron-public-website-acceptance.json"),
      `${JSON.stringify(result, null, 2)}\n`,
      "utf8",
    );
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    await page?.screenshot({
      path: join(artifactRoot, "electron-public-website-failure.png"),
      type: "png",
      fullPage: true,
    }).catch(() => undefined);
    throw new Error(JSON.stringify({
      phase,
      message: error instanceof Error ? error.message : String(error),
      rendererErrors,
      url: page?.url() ?? null,
      body: await page?.locator("body").innerText().catch(() => null),
    }));
  } finally {
    await quitOwnedElectron(electronApp).catch(() => undefined);
    await rm(temporaryProfile, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
