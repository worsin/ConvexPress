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

async function clickAndWaitForNewOperation(detail, button, timeoutMs) {
  const previousId = await detail.getAttribute("data-operation-id");
  await button.click();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const nextId = await detail.getAttribute("data-operation-id");
    if (nextId && nextId !== previousId) return nextId;
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error("Timed out waiting for the newly created operation detail.");
}

async function selectOptionContaining(select, text, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await select.locator("option").evaluateAll(
      (options, expectedText) =>
        options.find((option) => option.textContent?.includes(expectedText))?.value ?? null,
      text,
    );
    if (value) {
      await select.selectOption(value);
      return value;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error(`No select option contained ${text}.`);
}

function dismissShutdownDialogs(page) {
  page.on("dialog", (dialog) => {
    void dialog.dismiss().catch(() => undefined);
  });
}

async function main() {
  const credentials = await readCredentials();
  const fleet = loadTestFleetConfig();
  const handoffOnly =
    process.env.CONVEXPRESS_ACCEPTANCE_HANDOFF_ONLY === "1";
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
      convexUrl: fleet.control.deploymentOrigin,
      convexSiteUrl: fleet.control.siteOrigin,
    }),
    "utf8",
  );

  const launchEnvironment = buildElectronAcceptanceEnvironment(process.env, {
    CONVEXPRESS_DESKTOP_DEV: "1",
    CONVEXPRESS_DESKTOP_DEV_URL: fleet.rendererOrigin,
  });

  const launchElectron = () =>
    _electron.launch({
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

  let electronApp;
  let tracingStarted = false;
  let phase = "launch-initial-electron";
  const rendererErrors = [];
  try {
    electronApp = await launchElectron();

    phase = "open-initial-window";
    const page = await electronApp.firstWindow();
    dismissShutdownDialogs(page);
    page.on("console", (message) => {
      if (message.type() === "error") rendererErrors.push(message.text());
    });
    await page.waitForLoadState("domcontentloaded");

    phase = "verify-isolated-profile";
    const actualUserData = await electronApp.evaluate(({ app }) =>
      app.getPath("userData"),
    );
    if ((await realpath(actualUserData)) !== (await realpath(expectedUserData))) {
      throw new Error(
        `Electron acceptance profile mismatch: expected ${expectedUserData}, received ${actualUserData}`,
      );
    }

    phase = "start-tracing";
    const context = page.context();
    await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
    tracingStarted = true;

    phase = "verify-auth-bridge";
    const hasAuthBridge = await page.evaluate(
      () => typeof window.electronAuth?.getItem === "function",
    );
    if (!hasAuthBridge) throw new Error("Electron auth bridge is unavailable.");

    await page.screenshot({
      path: join(artifactRoot, "electron-login.png"),
      type: "png",
    });

    phase = "authenticate-operator";
    const organizationSelect = page.getByRole("combobox", {
      name: "Organization",
    });
    if (!(await organizationSelect.isVisible().catch(() => false))) {
      await page.getByRole("textbox", { name: /email/i }).fill(credentials.email);
      await page.getByLabel(/password/i).fill(credentials.password);
      await page.getByRole("button", { name: /sign in|continue/i }).click();
    }

    await organizationSelect.waitFor({ state: "visible", timeout: 20_000 });
    phase = "switch-shop-live";
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
    await page.getByText("No recent activity.", { exact: true }).waitFor({
      state: "visible",
      timeout: 20_000,
    });
    await page.screenshot({
      path: join(artifactRoot, "electron-live-dashboard.png"),
      type: "png",
    });

    if (!handoffOnly) {
    phase = "create-real-live-backup-from-electron";
    await page.getByRole("button", { name: "Site operations" }).click();
    const liveOperationsPanel = page.getByRole("complementary", {
      name: "Site operations",
    });
    await liveOperationsPanel.waitFor({ state: "visible", timeout: 10_000 });
    await liveOperationsPanel
      .getByRole("heading", { name: "Verified backups" })
      .waitFor({ state: "visible", timeout: 20_000 });
    const liveOperationDetail = liveOperationsPanel.getByRole("region", {
      name: "Operation detail",
    });
    await clickAndWaitForNewOperation(
      liveOperationDetail,
      liveOperationsPanel.getByRole("button", { name: "Create full backup" }),
      30_000,
    );
    await liveOperationDetail
      .getByText("site.backup.create", { exact: true })
      .waitFor({ state: "visible", timeout: 20_000 });
    await liveOperationDetail
      .getByText("Completed", { exact: true })
      .first()
      .waitFor({ state: "visible", timeout: 240_000 });
    await liveOperationsPanel
      .getByRole("button", { name: "Close site operations" })
      .click();

    phase = "switch-shop-staging";
    await environmentSelect.selectOption({ label: "Staging" });
    await page.waitForTimeout(2_000);
    const stagingTitle = page
      .getByText("Northstar Shop — Staging", { exact: true })
      .first();
    if (!(await stagingTitle.isVisible().catch(() => false))) {
      phase = "recover-staging-baseline-from-prebackup";
      await page.getByRole("button", { name: "Site operations" }).click();
      const recoveryPanel = page.getByRole("complementary", {
        name: "Site operations",
      });
      await recoveryPanel.waitFor({ state: "visible", timeout: 10_000 });
      const recoverySelect = recoveryPanel.getByRole("combobox", {
        name: "Verified snapshot",
        exact: true,
      });
      const recoveryDetail = recoveryPanel.getByRole("region", {
        name: "Operation detail",
      });
      const resumeRecovery = recoveryPanel.getByRole("button", {
        name: /Resume from snapshot\.import/,
      });
      await recoveryDetail
        .getByText("site.restore", { exact: true })
        .waitFor({ state: "visible", timeout: 20_000 });
      await page.waitForTimeout(250);
      if ((await resumeRecovery.count()) > 0) {
        await resumeRecovery.scrollIntoViewIfNeeded();
        await resumeRecovery.waitFor({ state: "visible", timeout: 20_000 });
        await resumeRecovery.click();
      } else {
        await selectOptionContaining(recoverySelect, "staging · pre-restore");
        await recoveryPanel
          .getByLabel(/Type RESTORE acceptance:northstar:shop:staging/)
          .fill("RESTORE acceptance:northstar:shop:staging");
        await recoveryPanel
          .getByRole("button", { name: "Create pre-backup and restore" })
          .click();
      }
      await recoveryDetail
        .getByText("site.restore", { exact: true })
        .waitFor({ state: "visible", timeout: 30_000 });
      await recoveryDetail
        .getByText("Completed", { exact: true })
        .first()
        .waitFor({ state: "visible", timeout: 300_000 });
      await page.waitForTimeout(1_000);
      await recoveryPanel
        .getByRole("button", { name: "Close site operations" })
        .click();
    }
    await page
      .getByText("Northstar Shop — Staging", { exact: true })
      .first()
      .waitFor({ state: "visible", timeout: 20_000 });
    await page.screenshot({
      path: join(artifactRoot, "electron-staging-dashboard.png"),
      type: "png",
    });

    phase = "open-staging-lifecycle-panel";
    await page.getByRole("button", { name: "Site operations" }).click();
    const operationsPanel = page.getByRole("complementary", {
      name: "Site operations",
    });
    await operationsPanel.waitFor({ state: "visible", timeout: 10_000 });
    await operationsPanel
      .getByText("acceptance:northstar:shop:staging", { exact: true })
      .waitFor({ state: "visible" });
    await operationsPanel
      .getByRole("heading", { name: "Verified backups" })
      .waitFor({ state: "visible", timeout: 20_000 });
    const verifiedBackupsRegion = operationsPanel.getByRole("region", {
      name: "Verified backups",
    });
    const verifiedBackupItems = verifiedBackupsRegion.getByRole("listitem");
    phase = "create-real-staging-backup-from-electron";
    const createBackupButton = operationsPanel.getByRole("button", {
      name: "Create full backup",
    });
    await createBackupButton.waitFor({ state: "visible" });
    if (await createBackupButton.isDisabled()) {
      const blocker = await operationsPanel
        .getByText(/interrupted operation|exclusive lock/i)
        .textContent()
        .catch(() => null);
      throw new Error(`Backup action unexpectedly disabled: ${blocker ?? "unknown"}`);
    }
    const operationDetail = operationsPanel.getByRole("region", {
      name: "Operation detail",
    });
    await clickAndWaitForNewOperation(operationDetail, createBackupButton, 30_000);
    await operationDetail
      .getByText("Completed", { exact: true })
      .first()
      .waitFor({ state: "visible", timeout: 240_000 });
    await operationDetail
      .getByText("Snapshot checksum verified", { exact: true })
      .waitFor({ state: "visible", timeout: 20_000 });
    await verifiedBackupsRegion
      .getByText(/255 tables/)
      .first()
      .waitFor({ state: "visible", timeout: 20_000 });
    await page.waitForTimeout(400);
    await page.screenshot({
      path: join(artifactRoot, "electron-staging-backup-complete.png"),
      type: "png",
    });

    phase = "clone-live-into-staging-from-electron";
    const sourceEnvironmentSelect = operationsPanel.getByRole("combobox", {
      name: "Source environment",
      exact: true,
    });
    await selectOptionContaining(sourceEnvironmentSelect, "Live ·");
    await clickAndWaitForNewOperation(
      operationDetail,
      operationsPanel.getByRole("button", {
        name: "Create pre-backup and clone",
      }),
      30_000,
    );
    await operationDetail
      .getByText("site.clone", { exact: true })
      .waitFor({ state: "visible", timeout: 30_000 });
    await operationDetail
      .getByText("Completed", { exact: true })
      .first()
      .waitFor({ state: "visible", timeout: 360_000 });
    await operationDetail
      .getByText("9 of 9 steps", { exact: true })
      .waitFor({ state: "visible", timeout: 20_000 });
    await page.waitForTimeout(400);
    await page.screenshot({
      path: join(artifactRoot, "electron-staging-clone-complete.png"),
      type: "png",
    });
    await operationsPanel
      .getByRole("button", { name: "Close site operations" })
      .click();
    await page
      .getByText("Northstar Shop — Staging", { exact: true })
      .first()
      .waitFor({ state: "visible", timeout: 30_000 });

    phase = "rollback-staging-clone-from-prebackup-in-electron";
    await page.getByRole("button", { name: "Site operations" }).click();
    await operationsPanel.waitFor({ state: "visible", timeout: 10_000 });
    const restoreSelect = operationsPanel.getByRole("combobox", {
      name: "Verified snapshot",
      exact: true,
    });
    await selectOptionContaining(restoreSelect, "staging · pre-clone");
    await operationsPanel
      .getByLabel(/Type RESTORE acceptance:northstar:shop:staging/)
      .fill("RESTORE acceptance:northstar:shop:staging");
    await clickAndWaitForNewOperation(
      operationDetail,
      operationsPanel.getByRole("button", {
        name: "Create pre-backup and restore",
      }),
      30_000,
    );
    await operationDetail
      .getByText("site.restore", { exact: true })
      .waitFor({ state: "visible", timeout: 30_000 });
    await operationDetail
      .getByText("Completed", { exact: true })
      .first()
      .waitFor({ state: "visible", timeout: 360_000 });
    await operationsPanel
      .getByRole("button", { name: "Close site operations" })
      .click();
    await page
      .getByText("Northstar Shop — Staging", { exact: true })
      .first()
      .waitFor({ state: "visible", timeout: 30_000 });

    phase = "restore-live-snapshot-into-staging-from-electron";
    await page.getByRole("button", { name: "Site operations" }).click();
    await operationsPanel.waitFor({ state: "visible", timeout: 10_000 });
    await selectOptionContaining(restoreSelect, "live · manual");
    await operationsPanel
      .getByLabel(/Type RESTORE acceptance:northstar:shop:staging/)
      .fill("RESTORE acceptance:northstar:shop:staging");
    await clickAndWaitForNewOperation(
      operationDetail,
      operationsPanel.getByRole("button", {
        name: "Create pre-backup and restore",
      }),
      30_000,
    );
    await operationDetail
      .getByText("site.restore", { exact: true })
      .waitFor({ state: "visible", timeout: 30_000 });
    await operationDetail
      .getByText("Completed", { exact: true })
      .first()
      .waitFor({ state: "visible", timeout: 300_000 });
    await operationDetail
      .getByText("6 of 6 steps", { exact: true })
      .waitFor({ state: "visible", timeout: 20_000 });
    await operationDetail
      .getByText("Snapshot checksum verified", { exact: true })
      .waitFor({ state: "visible", timeout: 20_000 });
    await page.waitForTimeout(400);
    await page.screenshot({
      path: join(artifactRoot, "electron-staging-restore-live-complete.png"),
      type: "png",
    });
    await operationsPanel
      .getByRole("button", { name: "Close site operations" })
      .click();
    await page
      .getByText("Northstar Shop — Staging", { exact: true })
      .first()
      .waitFor({ state: "visible", timeout: 30_000 });

    phase = "rollback-staging-from-verified-prebackup-in-electron";
    await page.getByRole("button", { name: "Site operations" }).click();
    await operationsPanel.waitFor({ state: "visible", timeout: 10_000 });
    await selectOptionContaining(restoreSelect, "staging · pre-restore");
    await operationsPanel
      .getByLabel(/Type RESTORE acceptance:northstar:shop:staging/)
      .fill("RESTORE acceptance:northstar:shop:staging");
    await clickAndWaitForNewOperation(
      operationDetail,
      operationsPanel.getByRole("button", {
        name: "Create pre-backup and restore",
      }),
      30_000,
    );
    await operationDetail
      .getByText("site.restore", { exact: true })
      .waitFor({ state: "visible", timeout: 30_000 });
    await operationDetail
      .getByText("Completed", { exact: true })
      .first()
      .waitFor({ state: "visible", timeout: 300_000 });
    await page.waitForTimeout(400);
    await page.screenshot({
      path: join(artifactRoot, "electron-staging-rollback-complete.png"),
      type: "png",
    });
    await operationsPanel
      .getByRole("button", { name: "Close site operations" })
      .click();
    await page
      .getByText("Northstar Shop — Staging", { exact: true })
      .first()
      .waitFor({ state: "visible", timeout: 30_000 });

    phase = "promote-staging-into-live-from-electron";
    await environmentSelect.selectOption({ label: "Live" });
    await page
      .getByText("Northstar Shop — Live", { exact: true })
      .first()
      .waitFor({ state: "visible", timeout: 20_000 });
    await page.getByRole("button", { name: "Site operations" }).click();
    await liveOperationsPanel.waitFor({ state: "visible", timeout: 10_000 });
    const liveSourceEnvironmentSelect = liveOperationsPanel.getByRole(
      "combobox",
      {
        name: "Source environment",
        exact: true,
      },
    );
    await selectOptionContaining(liveSourceEnvironmentSelect, "Staging ·");
    await liveOperationsPanel
      .getByLabel(/Type PROMOTE TO acceptance:northstar:shop:live/)
      .fill("PROMOTE TO acceptance:northstar:shop:live");
    const liveReplacementDetail = liveOperationsPanel.getByRole("region", {
      name: "Operation detail",
    });
    await clickAndWaitForNewOperation(
      liveReplacementDetail,
      liveOperationsPanel.getByRole("button", {
        name: "Create pre-backup and promote",
      }),
      30_000,
    );
    await liveReplacementDetail
      .getByText("site.promote", { exact: true })
      .waitFor({ state: "visible", timeout: 30_000 });
    await liveReplacementDetail
      .getByText("Completed", { exact: true })
      .first()
      .waitFor({ state: "visible", timeout: 360_000 });
    await liveReplacementDetail
      .getByText("9 of 9 steps", { exact: true })
      .waitFor({ state: "visible", timeout: 20_000 });
    await page.waitForTimeout(400);
    await page.screenshot({
      path: join(artifactRoot, "electron-live-promotion-complete.png"),
      type: "png",
    });
    await liveOperationsPanel
      .getByRole("button", { name: "Close site operations" })
      .click();
    await page
      .getByText("Northstar Shop — Live", { exact: true })
      .first()
      .waitFor({ state: "visible", timeout: 30_000 });

    phase = "rollback-live-promotion-from-prebackup-in-electron";
    await page.getByRole("button", { name: "Site operations" }).click();
    await liveOperationsPanel.waitFor({ state: "visible", timeout: 10_000 });
    const liveRestoreSelect = liveOperationsPanel.getByRole("combobox", {
      name: "Verified snapshot",
      exact: true,
    });
    await selectOptionContaining(liveRestoreSelect, "live · pre-promote");
    await liveOperationsPanel
      .getByLabel(/Type RESTORE acceptance:northstar:shop:live/)
      .fill("RESTORE acceptance:northstar:shop:live");
    await clickAndWaitForNewOperation(
      liveReplacementDetail,
      liveOperationsPanel.getByRole("button", {
        name: "Create pre-backup and restore",
      }),
      30_000,
    );
    await liveReplacementDetail
      .getByText("site.restore", { exact: true })
      .waitFor({ state: "visible", timeout: 30_000 });
    await liveReplacementDetail
      .getByText("Completed", { exact: true })
      .first()
      .waitFor({ state: "visible", timeout: 360_000 });
    await page.waitForTimeout(400);
    await page.screenshot({
      path: join(artifactRoot, "electron-live-promotion-rollback-complete.png"),
      type: "png",
    });
    await liveOperationsPanel
      .getByRole("button", { name: "Close site operations" })
      .click();
    await page
      .getByText("Northstar Shop — Live", { exact: true })
      .first()
      .waitFor({ state: "visible", timeout: 30_000 });
    await environmentSelect.selectOption({ label: "Staging" });
    await page
      .getByText("Northstar Shop — Staging", { exact: true })
      .first()
      .waitFor({ state: "visible", timeout: 20_000 });

    phase = "keyboard-environment-switch";
    await environmentSelect.focus();
    await environmentSelect.press("l");
    await page
      .getByText("Northstar Shop — Live", { exact: true })
      .first()
      .waitFor({ state: "visible", timeout: 20_000 });
    await page.waitForTimeout(1_100);
    await environmentSelect.press("s");
    await page
      .getByText("Northstar Shop — Staging", { exact: true })
      .first()
      .waitFor({ state: "visible", timeout: 20_000 });
    } else {
      phase = "switch-staging-for-focused-handoff-acceptance";
      await environmentSelect.selectOption({ label: "Staging" });
      await page
        .getByText("Northstar Shop — Staging", { exact: true })
        .first()
        .waitFor({ state: "visible", timeout: 20_000 });
    }

    phase = "export-portable-handoff-from-electron";
    await page
      .getByRole("button", { name: "Transfer site", exact: true })
      .click();
    const handoffPanel = page.getByRole("complementary", {
      name: "Website handoff",
    });
    await handoffPanel.waitFor({ state: "visible", timeout: 10_000 });
    await handoffPanel
      .getByRole("checkbox", { name: /Include verified snapshot references/ })
      .check();
    await handoffPanel
      .getByRole("button", { name: "Create verified handoff package" })
      .click();
    await handoffPanel
      .getByText("Package checksum verified", { exact: true })
      .waitFor({ state: "visible", timeout: 60_000 });
    const handoffOutput = handoffPanel.getByLabel("Portable handoff package");
    const handoffPackageJson = await handoffOutput.inputValue();
    const handoffPackage = JSON.parse(handoffPackageJson);
    if (
      handoffPackage.format !== "convexpress-handoff" ||
      handoffPackage.formatVersion !== "1.0.0" ||
      handoffPackage.manifest?.website?.websiteKey !==
        "acceptance:northstar:shop" ||
      handoffPackage.manifest?.environments?.length !== 2 ||
      handoffPackage.manifest.environments.some(
        (environment) => !environment.snapshot?.checksumSha256,
      )
    ) {
      throw new Error("Electron handoff package did not contain the expected verified website manifest.");
    }
    if (
      /"(?:deploymentAdminKey|privateKeyPem|credentials|authTag|encrypted)"\s*:/.test(
        handoffPackageJson,
      ) ||
      /BEGIN [A-Z ]*PRIVATE KEY/.test(handoffPackageJson)
    ) {
      throw new Error("Electron handoff package exposed a protected credential field.");
    }
    const handoffId = handoffPackage.manifest.handoffId;
    const downloadedHandoffPath = join(
      artifactRoot,
      "electron-northstar-handoff.json",
    );
    await electronApp.evaluate(
      ({ dialog }, filePath) => {
        dialog.showSaveDialog = async () => ({
          canceled: false,
          filePath,
        });
      },
      downloadedHandoffPath,
    );
    await handoffPanel.getByRole("button", { name: "Save JSON" }).click();
    await handoffPanel
      .getByText("Handoff package saved.", { exact: true })
      .waitFor({ state: "visible", timeout: 20_000 });
    if ((await readFile(downloadedHandoffPath, "utf8")).trim() !== handoffPackageJson) {
      throw new Error("Downloaded handoff package differs from the verified Electron package.");
    }

    phase = "import-portable-handoff-from-electron";
    await handoffPanel
      .getByLabel("Handoff package to import")
      .fill(handoffPackageJson);
    await handoffPanel
      .getByRole("button", { name: "Verify and import registry" })
      .click();
    await handoffPanel
      .getByText("Website already matches this package", { exact: true })
      .waitFor({ state: "visible", timeout: 30_000 });
    await handoffPanel
      .getByText("2 environments · 2 secure connections required", {
        exact: true,
      })
      .waitFor({ state: "visible", timeout: 10_000 });

    phase = "revoke-portable-handoff-from-electron";
    const handoffHistoryItem = handoffPanel
      .getByRole("listitem")
      .filter({ hasText: handoffId })
      .first();
    await handoffHistoryItem.scrollIntoViewIfNeeded();
    await handoffHistoryItem
      .getByText("downloaded", { exact: true })
      .waitFor({ state: "visible", timeout: 20_000 });
    await handoffHistoryItem.getByRole("button", { name: "Revoke" }).click();
    await handoffHistoryItem
      .getByLabel(new RegExp(`Type REVOKE HANDOFF ${handoffId}`))
      .fill(`REVOKE HANDOFF ${handoffId}`);
    await handoffHistoryItem
      .getByRole("button", { name: "Revoke package" })
      .click();
    await handoffHistoryItem
      .getByText("revoked", { exact: true })
      .waitFor({ state: "visible", timeout: 20_000 });
    await page.screenshot({
      path: join(artifactRoot, "electron-handoff-complete.png"),
      type: "png",
    });
    await handoffPanel
      .getByRole("button", { name: "Close website handoff" })
      .click();

    phase = "switch-journal-live";
    await websiteSelect.selectOption({ label: "Northstar Journal" });
    await page
      .getByText("Northstar Journal — Live", { exact: true })
      .first()
      .waitFor({ state: "visible", timeout: 20_000 });
    await page.screenshot({
      path: join(artifactRoot, "electron-journal-live.png"),
      type: "png",
    });

    phase = "verify-window-sizes";
    await electronApp.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.setSize(1024, 768);
    });
    await page.waitForTimeout(250);
    await assertStandaloneShellDoesNotOverlap(page);
    await page.screenshot({
      path: join(artifactRoot, "electron-minimum-window.png"),
      type: "png",
    });
    await electronApp.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.setSize(1440, 900);
    });
    await page.waitForTimeout(250);
    await page.screenshot({
      path: join(artifactRoot, "electron-wide-window.png"),
      type: "png",
    });

    phase = "verify-protected-auth-storage";
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

    phase = "stop-success-trace";
    await context.tracing.stop({
      path: join(artifactRoot, "standalone-electron-acceptance.zip"),
    });
    tracingStarted = false;

    phase = "restart-electron";
    await quitOwnedElectron(electronApp);
    electronApp = await launchElectron();
    const restoredPage = await electronApp.firstWindow();
    dismissShutdownDialogs(restoredPage);
    restoredPage.on("console", (message) => {
      if (message.type() === "error") rendererErrors.push(message.text());
    });
    phase = "verify-restored-session";
    await restoredPage
      .getByRole("combobox", { name: "Organization" })
      .waitFor({ state: "visible", timeout: 20_000 });
    if (await restoredPage.getByRole("textbox", { name: /email/i }).isVisible().catch(() => false)) {
      throw new Error("Protected operator session was not restored after restart.");
    }
    await restoredPage.screenshot({
      path: join(artifactRoot, "electron-restored-session.png"),
      type: "png",
    });

    console.log(
      JSON.stringify({
        acceptanceMode: handoffOnly ? "handoff-focused" : "full",
        electronWindow: true,
        isolatedProfile: true,
        authBridge: true,
        protectedAuthAtRest: true,
        rendererAuthStorageEmpty: true,
        liveDatabaseRendered: true,
        stagingDatabaseRendered: true,
        twoWebsitesRendered: true,
        threeSiteDatabasesRendered: true,
        keyboardEnvironmentSwitch: !handoffOnly,
        minimumWindowVerified: true,
        wideWindowVerified: true,
        protectedSessionRestored: true,
        lifecyclePanelRendered: !handoffOnly,
        realBackupStartedFromElectron: !handoffOnly,
        backupReceiptRendered: !handoffOnly,
        verifiedBackupHistoryRendered: !handoffOnly,
        liveBackupStartedFromElectron: !handoffOnly,
        stagingRestoreStartedFromElectron: !handoffOnly,
        stagingCloneStartedFromElectron: !handoffOnly,
        livePromotionStartedFromElectron: !handoffOnly,
        targetManagementIdentityPreserved: !handoffOnly,
        preBackupRollbackCompleted: !handoffOnly,
        clonePreBackupRollbackCompleted: !handoffOnly,
        promotionPreBackupRollbackCompleted: !handoffOnly,
        handoffExportedFromElectron: true,
        handoffChecksumVerified: true,
        handoffPackageSecretFree: true,
        handoffDownloadedFromElectron: true,
        handoffImportVerifiedFromElectron: true,
        handoffRevokedFromElectron: true,
        rendererErrorCount: rendererErrors.length,
      }),
    );
  } catch (error) {
    const failurePage = electronApp?.windows()[0];
    const alerts = failurePage
      ? await failurePage
          .getByRole("alert")
          .allTextContents()
          .catch(() => [])
      : [];
    if (failurePage) {
      await failurePage
        .screenshot({
          path: join(artifactRoot, "electron-acceptance-failure.png"),
          type: "png",
        })
        .catch(() => undefined);
    }
    throw new Error(
      JSON.stringify({
        message: error instanceof Error ? error.message : String(error),
        phase,
        pageUrl: failurePage?.url() ?? null,
        alerts,
        rendererErrorCount: rendererErrors.length,
      }),
    );
  } finally {
    if (tracingStarted && electronApp) {
      const pages = electronApp.windows();
      await pages[0]?.context().tracing.stop({
        path: join(artifactRoot, "standalone-electron-acceptance-failed.zip"),
      }).catch(() => undefined);
    }
    await quitOwnedElectron(electronApp).catch(() => undefined);
    await rm(temporaryProfile, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
