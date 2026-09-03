import { access, mkdtemp, mkdir, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  acceptanceProxyArguments,
  buildElectronAcceptanceEnvironment,
} from "./lib/electron-acceptance-environment.mjs";
import { quitOwnedElectron } from "./lib/process-lifecycle.mjs";
import { loadTestFleetConfig } from "./lib/test-fleet-config.mjs";
import {
  environmentActionAvailable,
  listSwitcherOrganizations,
  openEnvironmentAction,
  openSiteManager,
  selectBusiness,
  selectScope,
  shellIsVisible,
  waitForActiveEnvironment,
  waitForShell,
} from "./lib/shell-scope.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(scriptDirectory, "..");
const repositoryRoot = resolve(desktopRoot, "../..");
const artifactRoot = resolve(repositoryRoot, "../output/playwright");
const bunModulesRoot = join(repositoryRoot, "node_modules/.bun");
const packagedExecutable = join(
  desktopRoot,
  "dist/mac-arm64/ConvexPress.app/Contents/MacOS/ConvexPress",
);

async function resolveBunPackage(prefix, relativeEntry) {
  const entries = await readdir(bunModulesRoot);
  const packageDirectory = entries
    .filter((entry) => entry.startsWith(prefix))
    .sort()
    .at(-1);
  if (!packageDirectory) throw new Error(`Missing installed package: ${prefix}`);
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
    throw new Error("Packaged Electron acceptance credentials were not provided.");
  }
  return parsed;
}

async function main() {
  if (process.platform !== "darwin" || process.arch !== "arm64") {
    throw new Error("This acceptance targets the packaged macOS arm64 application.");
  }
  const credentials = await readCredentials();
  const fleet = loadTestFleetConfig();
  await mkdir(artifactRoot, { recursive: true });
  await access(packagedExecutable);

  const playwrightEntry = await resolveBunPackage(
    "playwright@",
    "node_modules/playwright/index.mjs",
  );
  const { _electron } = await import(pathToFileURL(playwrightEntry).href);
  const temporaryProfile = await mkdtemp(
    join(tmpdir(), "convexpress-packaged-electron-acceptance-"),
  );
  await writeFile(
    join(temporaryProfile, "convexpress-config.json"),
    JSON.stringify({
      setupComplete: true,
      mode: "existing",
      convexUrl: fleet.control.deploymentOrigin,
      convexSiteUrl: fleet.control.siteOrigin,
    }),
    "utf8",
  );

  const launchEnvironment = buildElectronAcceptanceEnvironment();

  let electronApp;
  let page;
  let phase = "launch-packaged-electron";
  const rendererErrors = [];
  try {
    electronApp = await _electron.launch({
      executablePath: packagedExecutable,
      args: [
        `--user-data-dir=${temporaryProfile}`,
        ...acceptanceProxyArguments(),
      ],
      cwd: desktopRoot,
      env: launchEnvironment,
      timeout: 60_000,
    });
    phase = "open-packaged-window";
    page = await electronApp.firstWindow();
    page.on("console", (message) => {
      if (message.type() === "error") rendererErrors.push(message.text());
    });
    page.on("pageerror", (error) => rendererErrors.push(error.message));
    await page.waitForLoadState("domcontentloaded");

    phase = "verify-packaged-process";
    const actualUserData = await electronApp.evaluate(({ app }) => app.getPath("userData"));
    if ((await realpath(actualUserData)) !== (await realpath(temporaryProfile))) {
      throw new Error("The packaged Electron app did not use its isolated profile.");
    }
    if (!(await electronApp.evaluate(({ app }) => app.isPackaged))) {
      throw new Error("Electron reported that the packaged application was not packaged.");
    }

    phase = "authenticate-packaged-operator";
    if (!(await shellIsVisible(page))) {
      await page.getByRole("textbox", { name: /email/i }).fill(credentials.email);
      await page.getByLabel(/^password$/i).fill(credentials.password);
      await page.getByRole("button", { name: /sign in|continue/i }).click();
    }
    await waitForShell(page);
    phase = "render-packaged-live-site";
    await selectScope(page, {
      organization: "Acceptance Agency Group",
      business: "Northstar Commerce",
      website: "Northstar Shop",
      environment: "Live",
    });
    await waitForActiveEnvironment(page, "Northstar Shop — Live");
    await page.getByText("No recent activity.", { exact: true }).waitFor({
      state: "visible",
      timeout: 20_000,
    });
    await page.screenshot({
      path: join(artifactRoot, "electron-packaged-macos-live.png"),
      type: "png",
    });
    if (rendererErrors.length > 0) {
      throw new Error(`Packaged Electron renderer errors: ${rendererErrors.join(" | ")}`);
    }
    const acceptanceResult = {
      acceptanceMode: "packaged-macos-arm64",
      electronWindow: true,
      appIsPackaged: true,
      packagedAssetsLoaded: true,
      isolatedProfile: true,
      operatorAuthenticated: true,
      liveDatabaseRendered: true,
      rendererErrorCount: rendererErrors.length,
    };
    await writeFile(
      join(artifactRoot, "electron-packaged-macos-acceptance.json"),
      `${JSON.stringify(acceptanceResult, null, 2)}\n`,
      "utf8",
    );
    process.stdout.write(`${JSON.stringify(acceptanceResult)}\n`);
  } catch (error) {
    const diagnostics = page
      ? {
          url: page.url(),
          title: await page.title().catch(() => null),
          body: await page.locator("body").innerText().catch(() => null),
        }
      : { url: null, title: null, body: null };
    await page?.screenshot({
      path: join(artifactRoot, "electron-packaged-macos-failure.png"),
      type: "png",
    }).catch(() => undefined);
    throw new Error(
      JSON.stringify({
        message: error instanceof Error ? error.message : String(error),
        phase,
        rendererErrors,
        ...diagnostics,
      }),
    );
  } finally {
    await quitOwnedElectron(electronApp).catch(() => undefined);
    await rm(temporaryProfile, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
