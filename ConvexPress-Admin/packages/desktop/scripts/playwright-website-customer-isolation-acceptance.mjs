import { randomBytes } from "node:crypto";
import { mkdir, mkdtemp, readdir, realpath, rm, writeFile } from "node:fs/promises";
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
const fleet = loadTestFleetConfig();
const CONTROL_ORIGIN = fleet.control.deploymentOrigin;
const CONTROL_SITE_ORIGIN = fleet.control.siteOrigin;
const RENDERER_ORIGIN = fleet.rendererOrigin;

const scopes = {
  shop: {
    organization: "Acceptance Agency Group",
    business: "Northstar Commerce",
    website: "Northstar Shop",
    environment: "Live",
    identity: "Northstar Shop — Live",
  },
  journal: {
    organization: "Acceptance Agency Group",
    business: "Northstar Commerce",
    website: "Northstar Journal",
    identity: "Northstar Journal — Live",
  },
  shopStaging: {
    organization: "Acceptance Agency Group",
    business: "Northstar Commerce",
    website: "Northstar Shop",
    environment: "Staging",
    identity: "Northstar Shop — Staging",
  },
};

async function resolveBunPackage(prefix, relativeEntry) {
  const entries = await readdir(bunModulesRoot);
  const packageDirectory = entries.filter((entry) => entry.startsWith(prefix)).sort().at(-1);
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
    throw new Error("Electron website-customer-isolation credentials were not provided");
  }
  return parsed;
}

function dismissShutdownDialogs(page) {
  page.on("dialog", (dialog) => void dialog.dismiss().catch(() => undefined));
}

async function selectSiteScope(page, scope) {
  await selectScope(page, {
    organization: scope.organization,
    business: scope.business,
    website: scope.website,
    environment: scope.environment,
  });

  await waitForActiveEnvironment(page, scope.identity);
  await page.getByRole("heading", { level: 1 }).or(
    page.getByRole("heading", { name: "Add New User", exact: true }),
  ).waitFor({ state: "visible", timeout: 20_000 });
}

async function openInvitationPage(page) {
  const heading = page.getByRole("heading", { name: "Add New User", exact: true });
  if (await heading.isVisible().catch(() => false)) return;

  const navigation = page.getByRole("navigation", { name: "Admin navigation" });
  const users = navigation.getByRole("button", { name: "Users", exact: true });
  if ((await users.getAttribute("aria-expanded")) !== "true") await users.click();
  await navigation.getByRole("link", { name: "Add New User", exact: true }).click();
  await heading.waitFor({ state: "visible", timeout: 15_000 });
}

async function inviteSubscriber(page, email) {
  await openInvitationPage(page);
  const form = page.locator("form:has(#invite-email)");
  await form.getByLabel(/^Email/).fill(email);
  await form.getByLabel("First Name").fill("Electron");
  await form.getByLabel("Last Name").fill("Customer");
  await form.getByLabel("Role").selectOption("subscriber");
  const notification = form.getByLabel("Send the new user an email about their invitation");
  if (await notification.isChecked()) {
    await form.getByText("Send the new user an email about their invitation", { exact: true }).click();
  }
  await form.getByRole("button", { name: "Add New User", exact: true }).click();

  const row = page.getByRole("row").filter({ hasText: email });
  await row.waitFor({ state: "visible", timeout: 20_000 });
  await row.getByText("subscriber", { exact: true }).waitFor({ state: "visible" });
  await row.getByText("Pending", { exact: true }).waitFor({ state: "visible" });
}

async function assertInviteFormContrast(page) {
  await openInvitationPage(page);
  const ratios = await page.locator("form:has(#invite-email)").evaluate((form) => {
    function rgb(value) {
      const match = value.match(/rgba?\((\d+)[, ]+(\d+)[, ]+(\d+)/u);
      if (match) return [Number(match[1]), Number(match[2]), Number(match[3])];
      const oklch = value.match(
        /oklch\(([\d.]+)(%)?\s+([\d.]+)\s+([\d.]+)(?:deg)?(?:\s*\/\s*[\d.]+%?)?\)/u,
      );
      if (!oklch) throw new Error(`Unsupported computed color: ${value}`);
      const lightness = Number(oklch[1]) / (oklch[2] ? 100 : 1);
      const chroma = Number(oklch[3]);
      const hue = (Number(oklch[4]) * Math.PI) / 180;
      const a = chroma * Math.cos(hue);
      const b = chroma * Math.sin(hue);
      const lRoot = lightness + 0.3963377774 * a + 0.2158037573 * b;
      const mRoot = lightness - 0.1055613458 * a - 0.0638541728 * b;
      const sRoot = lightness - 0.0894841775 * a - 1.291485548 * b;
      const l = lRoot ** 3;
      const m = mRoot ** 3;
      const s = sRoot ** 3;
      const linear = [
        4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
        -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
      ];
      return linear.map((channel) => {
        const gamma =
          channel <= 0.0031308
            ? 12.92 * channel
            : 1.055 * channel ** (1 / 2.4) - 0.055;
        return Math.min(255, Math.max(0, gamma * 255));
      });
    }
    function luminance([red, green, blue]) {
      const channels = [red, green, blue].map((channel) => {
        const value = channel / 255;
        return value <= 0.04045
          ? value / 12.92
          : ((value + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
    }
    function contrast(foreground, background) {
      const lighter = Math.max(luminance(foreground), luminance(background));
      const darker = Math.min(luminance(foreground), luminance(background));
      return (lighter + 0.05) / (darker + 0.05);
    }
    const card = form.parentElement;
    if (!card) throw new Error("Invitation card was unavailable");
    const background = rgb(getComputedStyle(card).backgroundColor);
    const ids = [
      "invite-email",
      "invite-role",
      "invite-message",
    ];
    return ids.flatMap((id) => {
      const field = document.getElementById(id);
      const label = document.querySelector(`label[for="${id}"]`);
      if (!field || !label) throw new Error(`Invitation control ${id} was unavailable`);
      return [
        [id, contrast(rgb(getComputedStyle(field).color), background)],
        [`${id}-label`, contrast(rgb(getComputedStyle(label).color), background)],
      ];
    });
  });
  const failing = ratios.filter(([, ratio]) => ratio < 4.5);
  if (failing.length) {
    throw new Error(
      `Invitation form contrast fell below 4.5:1 for ${failing
        .map(([name, ratio]) => `${name} (${ratio.toFixed(2)})`)
        .join(", ")}`,
    );
  }
  return Object.fromEntries(ratios.map(([name, ratio]) => [name, Number(ratio.toFixed(2))]));
}

async function assertInvitationVisibility(page, visibleEmails, hiddenEmails) {
  await openInvitationPage(page);
  for (const email of visibleEmails) {
    await page.getByRole("row").filter({ hasText: email }).waitFor({
      state: "visible",
      timeout: 15_000,
    });
  }
  for (const email of hiddenEmails) {
    if (await page.getByRole("row").filter({ hasText: email }).isVisible().catch(() => false)) {
      throw new Error(`${email} leaked into the selected website database`);
    }
  }
}

async function revokeInvitation(page, email) {
  const row = page.getByRole("row").filter({ hasText: email });
  if (!(await row.isVisible().catch(() => false))) return;
  const revoke = row.getByRole("button", { name: "Revoke", exact: true });
  if (!(await revoke.isVisible().catch(() => false))) return;
  await revoke.click();
  const dialog = page.getByRole("alertdialog", { name: "Revoke Invitation?" });
  await dialog.waitFor({ state: "visible", timeout: 10_000 });
  await dialog.getByRole("button", { name: "Revoke", exact: true }).click();
  await row.getByText("Revoked", { exact: true }).waitFor({ state: "visible", timeout: 15_000 });
}

async function revokePendingAcceptanceInvitations(page) {
  await openInvitationPage(page);
  const rows = page.getByRole("row").filter({
    hasText: /cvpr-(shop-live|shop-staging|journal)-customer-[^\s]+@example\.test/,
  });
  for (let index = (await rows.count()) - 1; index >= 0; index -= 1) {
    const row = rows.nth(index);
    const revoke = row.getByRole("button", { name: "Revoke", exact: true });
    if (!(await revoke.isVisible().catch(() => false))) continue;
    await revoke.click();
    const dialog = page.getByRole("alertdialog", { name: "Revoke Invitation?" });
    await dialog.waitFor({ state: "visible", timeout: 10_000 });
    await dialog.getByRole("button", { name: "Revoke", exact: true }).click();
    await row.getByText("Revoked", { exact: true }).waitFor({ state: "visible", timeout: 15_000 });
  }
}

async function main() {
  const credentials = await readCredentials();
  await mkdir(artifactRoot, { recursive: true });
  const [playwrightEntry, electronExecutable] = await Promise.all([
    resolveBunPackage("playwright@", "node_modules/playwright/index.mjs"),
    resolveBunPackage("electron@", "node_modules/electron/dist/Electron.app/Contents/MacOS/Electron"),
  ]);
  const { _electron } = await import(pathToFileURL(playwrightEntry).href);
  const temporaryProfile = await mkdtemp(join(tmpdir(), "convexpress-customer-isolation-electron-"));
  const expectedUserData = join(temporaryProfile, "-dev");
  await mkdir(expectedUserData, { recursive: true });
  await writeFile(
    join(expectedUserData, "convexpress-config.json"),
    JSON.stringify({
      setupComplete: true,
      mode: "existing",
      convexUrl: CONTROL_ORIGIN,
      convexSiteUrl: CONTROL_SITE_ORIGIN,
    }),
    "utf8",
  );

  const launchEnvironment = buildElectronAcceptanceEnvironment(process.env, {
    CONVEXPRESS_DESKTOP_DEV: "1",
    CONVEXPRESS_DESKTOP_DEV_URL: RENDERER_ORIGIN,
  });

  const suffix = `${Date.now().toString(36)}-${randomBytes(4).toString("hex")}`;
  const emails = {
    shopLive: `cvpr-shop-live-customer-${suffix}@example.test`,
    shopStaging: `cvpr-shop-staging-customer-${suffix}@example.test`,
    journal: `cvpr-journal-customer-${suffix}@example.test`,
  };
  const created = [];
  const rendererErrors = [];
  let electronApp;
  let page;
  let tracing = false;
  let phase = "launch";
  let inviteFormContrast = null;

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
    page = await electronApp.firstWindow();
    dismissShutdownDialogs(page);
    page.on("console", (message) => {
      if (message.type() === "error") rendererErrors.push(message.text());
    });
    await page.waitForLoadState("domcontentloaded");
    const actualUserData = await electronApp.evaluate(({ app }) => app.getPath("userData"));
    if ((await realpath(actualUserData)) !== (await realpath(expectedUserData))) {
      throw new Error("Electron website-customer-isolation profile was not isolated");
    }

    phase = "authenticate";
    await page.getByRole("textbox", { name: /email/i }).fill(credentials.email);
    await page.getByLabel(/^password$/i).fill(credentials.password);
    await page.getByRole("button", { name: /sign in|continue/i }).click();
    await waitForShell(page);
    await page.context().tracing.start({ screenshots: true, snapshots: true, sources: true });
    tracing = true;

    phase = "shop-customer";
    await selectSiteScope(page, scopes.shop);
    await revokePendingAcceptanceInvitations(page);
    await inviteSubscriber(page, emails.shopLive);
    inviteFormContrast = await assertInviteFormContrast(page);
    created.push([scopes.shop, emails.shopLive]);
    await assertInvitationVisibility(
      page,
      [emails.shopLive],
      [emails.shopStaging, emails.journal],
    );
    await page.getByRole("row").filter({ hasText: emails.shopLive }).scrollIntoViewIfNeeded();
    await page.screenshot({
      path: join(artifactRoot, "electron-customer-isolation-shop.png"),
      type: "png",
    });

    phase = "journal-customer";
    await selectSiteScope(page, scopes.journal);
    await revokePendingAcceptanceInvitations(page);
    await assertInvitationVisibility(page, [], [emails.shopLive, emails.shopStaging]);
    await inviteSubscriber(page, emails.journal);
    created.push([scopes.journal, emails.journal]);
    await assertInvitationVisibility(
      page,
      [emails.journal],
      [emails.shopLive, emails.shopStaging],
    );
    await page.getByRole("row").filter({ hasText: emails.journal }).scrollIntoViewIfNeeded();
    await page.screenshot({
      path: join(artifactRoot, "electron-customer-isolation-journal.png"),
      type: "png",
    });

    phase = "shop-staging-customer";
    await selectSiteScope(page, scopes.shopStaging);
    await revokePendingAcceptanceInvitations(page);
    await assertInvitationVisibility(page, [], [emails.shopLive, emails.journal]);
    await inviteSubscriber(page, emails.shopStaging);
    created.push([scopes.shopStaging, emails.shopStaging]);
    await assertInvitationVisibility(
      page,
      [emails.shopStaging],
      [emails.shopLive, emails.journal],
    );
    await page.getByRole("row").filter({ hasText: emails.shopStaging }).scrollIntoViewIfNeeded();
    await page.screenshot({
      path: join(artifactRoot, "electron-customer-isolation-shop-staging.png"),
      type: "png",
    });

    phase = "return-to-shop";
    await selectSiteScope(page, scopes.shop);
    await assertInvitationVisibility(
      page,
      [emails.shopLive],
      [emails.shopStaging, emails.journal],
    );

    phase = "outer-operator-separation";
    await openSiteManager(page);
    const manager = page.getByRole("complementary", { name: "Manage websites" });
    await manager.getByRole("button", { name: /People/ }).click();
    await manager
      .getByRole("region", { name: "Control-plane operators" })
      .waitFor({ state: "visible", timeout: 30_000 });
    for (const email of Object.values(emails)) {
      if (await manager.getByText(email, { exact: true }).isVisible().catch(() => false)) {
        throw new Error(`${email} was incorrectly promoted into the outer operator directory`);
      }
    }
    await page.screenshot({
      path: join(artifactRoot, "electron-customer-isolation-outer-people.png"),
      type: "png",
    });
    await manager.getByRole("button", { name: "Close site manager" }).click();

    phase = "cleanup";
    for (const [scope, email] of [...created].reverse()) {
      await selectSiteScope(page, scope);
      await assertInvitationVisibility(page, [email], []);
      await revokeInvitation(page, email);
    }

    await page.context().tracing.stop({
      path: join(artifactRoot, "electron-website-customer-isolation.zip"),
    });
    tracing = false;
    if (rendererErrors.length) {
      throw new Error(`Electron renderer emitted ${rendererErrors.length} errors`);
    }

    process.stdout.write(`${JSON.stringify({
      acceptanceMode: "electron-website-customer-isolation",
      electronOnly: true,
      twoWebsitesVerified: true,
      threeSiteDatabasesVerified: true,
      subscriberInvitationsCreatedInUi: true,
      crossSiteCustomerLeakageRejected: true,
      outerOperatorDirectoryRemainedSeparate: true,
      notificationDeliveryDisabled: true,
      inviteFormContrastVerified: true,
      inviteFormContrast,
      acceptanceInvitationsRevoked: true,
      rendererErrorCount: 0,
    })}\n`);
  } catch (error) {
    process.stderr.write(
      `Electron website customer isolation failed during ${phase}: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    throw error;
  } finally {
    if (page && created.length) {
      for (const [scope, email] of [...created].reverse()) {
        await selectScope(page, scope)
          .then(() => revokeInvitation(page, email))
          .catch(() => undefined);
      }
    }
    if (tracing && page) {
      await page.context().tracing.stop({
        path: join(artifactRoot, "electron-website-customer-isolation-failure.zip"),
      }).catch(() => undefined);
    }
    await quitOwnedElectron(electronApp).catch(() => undefined);
    await rm(temporaryProfile, { recursive: true, force: true }).catch(() => undefined);
  }
}

await main();
