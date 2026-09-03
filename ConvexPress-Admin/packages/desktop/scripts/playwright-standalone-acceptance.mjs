import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(scriptDirectory, "..");
const repositoryRoot = resolve(desktopRoot, "../..");
const artifactRoot = resolve(repositoryRoot, "../output/playwright");
const bunModulesRoot = join(repositoryRoot, "node_modules/.bun");

async function resolveBunPackage(prefix, relativeEntry) {
  const entries = await readdir(bunModulesRoot);
  const packageDirectory = entries
    .filter((entry) => entry.startsWith(prefix))
    .sort()
    .at(-1);
  if (!packageDirectory) {
    throw new Error(`Missing installed package: ${prefix}`);
  }
  return join(bunModulesRoot, packageDirectory, relativeEntry);
}

async function readCredentials() {
  if (process.stdin.isTTY && typeof process.stdin.setRawMode === "function") {
    process.stdin.setRawMode(true);
  }
  let input = "";
  for await (const chunk of process.stdin) {
    input += chunk.toString("utf8");
    if (input.includes("\n")) break;
  }
  const parsed = JSON.parse(input.trim());
  if (typeof parsed.email !== "string" || typeof parsed.password !== "string") {
    throw new Error("Electron acceptance credentials were not provided.");
  }
  return parsed;
}

async function assertStandaloneShellDoesNotOverlap(page) {
  const environmentBar = page
    .getByText(/^Contract:/)
    .first()
    .locator("..");
  const dashboardHeading = page.getByRole("heading", {
    name: "Dashboard",
    exact: true,
  });
  const [environmentBox, headingBox] = await Promise.all([
    environmentBar.boundingBox(),
    dashboardHeading.boundingBox(),
  ]);
  if (!environmentBox || !headingBox) {
    throw new Error("Standalone shell geometry could not be measured.");
  }
  const environmentBottom = environmentBox.y + environmentBox.height;
  if (headingBox.y < environmentBottom) {
    throw new Error("Standalone environment bar overlaps the site dashboard.");
  }
}

async function main() {
  const credentials = await readCredentials();
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
    join(tmpdir(), "convexpress-electron-acceptance-"),
  );
  const expectedUserData = join(temporaryProfile, "-dev");
  await mkdir(expectedUserData, { recursive: true });
  await writeFile(
    join(expectedUserData, "convexpress-config.json"),
    JSON.stringify({
      setupComplete: true,
      mode: "existing",
      convexUrl: "http://127.0.0.1:4720",
      convexSiteUrl: "http://127.0.0.1:4721",
    }),
    "utf8",
  );

  const launchEnvironment = {
    ...process.env,
    CONVEXPRESS_DESKTOP_DEV: "1",
    CONVEXPRESS_DESKTOP_DEV_URL: "http://127.0.0.1:4105",
  };
  delete launchEnvironment.ELECTRON_RUN_AS_NODE;

  let electronApp;
  let tracingStarted = false;
  const rendererErrors = [];
  try {
    electronApp = await _electron.launch({
      executablePath: electronExecutable,
      args: [`--user-data-dir=${temporaryProfile}`, desktopRoot],
      cwd: desktopRoot,
      env: launchEnvironment,
      timeout: 30_000,
    });

    const page = await electronApp.firstWindow();
    page.on("console", (message) => {
      if (message.type() === "error") rendererErrors.push(message.text());
    });
    await page.waitForLoadState("domcontentloaded");

    const actualUserData = await electronApp.evaluate(({ app }) =>
      app.getPath("userData"),
    );
    if ((await realpath(actualUserData)) !== (await realpath(expectedUserData))) {
      throw new Error(
        `Electron acceptance profile mismatch: expected ${expectedUserData}, received ${actualUserData}`,
      );
    }

    const context = page.context();
    await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
    tracingStarted = true;

    const hasAuthBridge = await page.evaluate(
      () => typeof window.electronAuth?.getItem === "function",
    );
    if (!hasAuthBridge) throw new Error("Electron auth bridge is unavailable.");

    await page.screenshot({
      path: join(artifactRoot, "electron-login.png"),
      type: "png",
    });

    const organizationSelect = page.getByRole("combobox", {
      name: "Organization",
    });
    if (!(await organizationSelect.isVisible().catch(() => false))) {
      await page.getByRole("textbox", { name: /email/i }).fill(credentials.email);
      await page.getByLabel(/password/i).fill(credentials.password);
      await page.getByRole("button", { name: /sign in|continue/i }).click();
    }

    await organizationSelect.waitFor({ state: "visible", timeout: 20_000 });
    await organizationSelect.selectOption({ label: "Acceptance Agency Group" });

    const businessSelect = page.getByRole("combobox", { name: "Business" });
    await businessSelect.waitFor({ state: "visible" });
    await businessSelect.selectOption({ label: "Northstar Commerce" });

    const websiteSelect = page.getByRole("combobox", { name: "Website" });
    await websiteSelect.selectOption({ label: "Northstar Shop" });

    const environmentSelect = page.getByRole("combobox", {
      name: "Environment",
    });
    await environmentSelect.selectOption({ label: "Live" });
    await page.getByText("Northstar Shop — Live", { exact: true }).first().waitFor({
      state: "visible",
      timeout: 20_000,
    });
    await assertStandaloneShellDoesNotOverlap(page);
    await page.screenshot({
      path: join(artifactRoot, "electron-live-dashboard.png"),
      type: "png",
    });

    await environmentSelect.selectOption({ label: "Staging" });
    await page
      .getByText("Northstar Shop — Staging", { exact: true })
      .first()
      .waitFor({ state: "visible", timeout: 20_000 });
    await page.screenshot({
      path: join(artifactRoot, "electron-staging-dashboard.png"),
      type: "png",
    });

    const rendererAuthStorage = await page.evaluate(() => ({
      localCookie: window.localStorage.getItem("better-auth_cookie"),
      localSession: window.localStorage.getItem("better-auth_session_data"),
      sessionCookie: window.sessionStorage.getItem("better-auth_cookie"),
      sessionData: window.sessionStorage.getItem("better-auth_session_data"),
    }));
    if (Object.values(rendererAuthStorage).some((value) => value !== null)) {
      throw new Error("Outer authentication leaked into browser storage.");
    }

    const authStorePath = join(actualUserData, "convexpress-auth.json");
    const authStore = JSON.parse(await readFile(authStorePath, "utf8"));
    const protectedValues = Object.values(authStore);
    if (
      protectedValues.length === 0 ||
      protectedValues.some(
        (value) =>
          typeof value !== "string" || !value.startsWith("safe-storage:v1:"),
      )
    ) {
      throw new Error("Electron authentication was not protected at rest.");
    }

    await context.tracing.stop({
      path: join(artifactRoot, "standalone-electron-acceptance.zip"),
    });
    tracingStarted = false;

    console.log(
      JSON.stringify({
        electronWindow: true,
        isolatedProfile: true,
        authBridge: true,
        protectedAuthAtRest: true,
        rendererAuthStorageEmpty: true,
        liveDatabaseRendered: true,
        stagingDatabaseRendered: true,
        rendererErrorCount: rendererErrors.length,
      }),
    );
  } finally {
    if (tracingStarted && electronApp) {
      const pages = electronApp.windows();
      await pages[0]?.context().tracing.stop({
        path: join(artifactRoot, "standalone-electron-acceptance-failed.zip"),
      });
    }
    await electronApp?.close().catch(() => undefined);
    await rm(temporaryProfile, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
