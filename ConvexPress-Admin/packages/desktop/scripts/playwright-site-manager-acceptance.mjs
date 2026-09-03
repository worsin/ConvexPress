import { mkdtemp, mkdir, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  acceptanceProxyArguments,
  buildElectronAcceptanceEnvironment,
} from "./lib/electron-acceptance-environment.mjs";
import { quitOwnedElectron } from "./lib/process-lifecycle.mjs";
import { loadTestFleetConfig } from "./lib/test-fleet-config.mjs";

import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
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
const B_ORIGIN = fleet.control.deploymentOrigin;
const B_SITE_ORIGIN = fleet.control.siteOrigin;
const RENDERER_ORIGIN = fleet.rendererOrigin;
const WEBSITE_KEY = "acceptance:northstar:shop";
const ACCEPTANCE_CONNECTION_LABEL = "Electron secure credential acceptance";

const requireFromControlPlane = createRequire(
  new URL("../../control-plane/package.json", import.meta.url),
);
const { convexClient, crossDomainClient } = requireFromControlPlane(
  "@convex-dev/better-auth/client/plugins",
);
const { createAuthClient } = requireFromControlPlane("better-auth/client");

const listWebsites = makeFunctionReference("websites:list");
const updateWebsite = makeFunctionReference("websites:update");
const listOrganizations = makeFunctionReference("organizations:list");
const updateOrganization = makeFunctionReference("organizations:update");
const listBusinesses = makeFunctionReference("businesses:list");
const updateBusiness = makeFunctionReference("businesses:update");
const listInstances = makeFunctionReference("websiteInstances:list");
const archiveInstance = makeFunctionReference("websiteInstances:archive");
const listConnections = makeFunctionReference("connections/queries:listForInstance");
const createConnection = makeFunctionReference("connections/actions:create");
const testConnection = makeFunctionReference("connections/actions:test");
const revokeConnection = makeFunctionReference("connections/actions:revoke");
const BASELINE_CONNECTION_NAME = "Northstar Shop Live";
const BASELINE_CONNECTION_LABEL = "Linux Worker acceptance fleet";

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
  if (
    typeof parsed.email !== "string" ||
    typeof parsed.password !== "string" ||
    typeof parsed.siteAdminKey !== "string"
  ) {
    throw new Error("Electron site-manager credentials were not provided");
  }
  return parsed;
}

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
  };
}

async function getControlToken(credentials) {
  const auth = createAuthClient({
    baseURL: B_SITE_ORIGIN,
    fetchOptions: { timeout: 15_000, headers: { origin: RENDERER_ORIGIN } },
    plugins: [
      convexClient(),
      crossDomainClient({ storage: memoryStorage(), disableCache: true }),
    ],
  });
  const { error } = await auth.signIn.email({
    email: credentials.email.trim().toLowerCase(),
    password: credentials.password,
  });
  if (error) throw new Error("Control-plane acceptance login failed");
  const cookie = auth.getCookie();
  if (!cookie) throw new Error("Control-plane acceptance cookie was not issued");
  const response = await fetch(`${B_SITE_ORIGIN}/api/auth/convex/token`, {
    headers: { accept: "application/json", cookie, origin: RENDERER_ORIGIN },
  });
  if (!response.ok) throw new Error("Control-plane acceptance token exchange failed");
  const body = await response.json();
  if (typeof body.token !== "string" || body.token.length < 100) {
    throw new Error("Control-plane acceptance token was invalid");
  }
  return body.token;
}

async function operatorClient(credentials) {
  const client = new ConvexHttpClient(B_ORIGIN);
  client.setAuth(await getControlToken(credentials));
  return client;
}

async function liveEnvironment(client) {
  const websites = await client.query(listWebsites, {});
  const website = websites.find((entry) => entry.websiteKey === WEBSITE_KEY);
  if (!website) throw new Error("Northstar Shop is not registered in the controller");
  const environments = await client.query(listInstances, { websiteId: website.websiteId });
  const live = environments.find((entry) => entry.kind === "live");
  if (!live) throw new Error("Northstar Shop live is not registered in the controller");
  return live;
}

async function cleanupAcceptanceConnections(client) {
  const live = await liveEnvironment(client);
  const connections = await client.query(listConnections, { instanceId: live.instanceId });
  for (const connection of connections) {
    if (connection.accountLabel === ACCEPTANCE_CONNECTION_LABEL && connection.isActive) {
      await client.action(revokeConnection, { connectionId: connection.connectionId });
    }
  }
}

async function ensureBaselineConnection(client, adminKey) {
  const live = await liveEnvironment(client);
  const connections = await client.query(listConnections, {
    instanceId: live.instanceId,
  });
  let active = connections.find(
    (connection) => connection.isActive && connection.status !== "revoked",
  );
  if (!active) {
    const created = await client.action(createConnection, {
      instanceId: live.instanceId,
      name: BASELINE_CONNECTION_NAME,
      accountLabel: BASELINE_CONNECTION_LABEL,
      deploymentAdminKey: adminKey,
    });
    const refreshed = await client.query(listConnections, {
      instanceId: live.instanceId,
    });
    active = refreshed.find(
      (connection) => connection.connectionId === created.connectionId,
    );
  }
  if (!active) throw new Error("The test-fleet baseline authority could not be restored");
  const health = await client.action(testConnection, {
    connectionId: active.connectionId,
  });
  if (health.status !== "healthy") {
    throw new Error("The restored test-fleet baseline authority is not healthy");
  }
  return active;
}

async function prepareAuthorityEnrollment(client, adminKey) {
  await cleanupAcceptanceConnections(client);
  const baseline = await ensureBaselineConnection(client, adminKey);
  await client.action(revokeConnection, {
    connectionId: baseline.connectionId,
  });
}

async function cleanupAcceptanceHierarchy(client, target) {
  if (!target) return;
  const organizations = await client.query(listOrganizations, {
    includeInactive: true,
  });
  const organization = organizations.find(
    (entry) => entry.slug === target.organizationSlug,
  );
  if (!organization) return;
  const businesses = await client.query(listBusinesses, {
    organizationId: organization.organizationId,
    includeInactive: true,
  });
  const business = businesses.find((entry) => entry.slug === target.businessSlug);
  if (business) {
    const websites = await client.query(listWebsites, {
      businessId: business.businessId,
      includeArchived: true,
    });
    const website = websites.find((entry) => entry.websiteKey === target.websiteKey);
    if (website) {
      const environments = await client.query(listInstances, {
        websiteId: website.websiteId,
        includeArchived: true,
      });
      for (const environment of environments) {
        if (environment.status === "active") {
          await client.mutation(archiveInstance, {
            instanceId: environment.instanceId,
            confirmation: `ARCHIVE ENVIRONMENT ${environment.instanceKey}`,
          });
        }
      }
      if (website.status !== "archived") {
        await client.mutation(updateWebsite, {
          websiteId: website.websiteId,
          status: "archived",
        });
      }
    }
    if (business.isActive) {
      await client.mutation(updateBusiness, {
        businessId: business.businessId,
        isActive: false,
      });
    }
  }
  if (organization.isActive) {
    await client.mutation(updateOrganization, {
      organizationId: organization.organizationId,
      isActive: false,
    });
  }
}

async function selectOptionContaining(select, text, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await select.locator("option").evaluateAll(
      (options, expected) => options.find((option) => option.textContent?.includes(expected))?.value ?? null,
      text,
    );
    if (value) {
      await select.selectOption(value);
      return value;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error(`No select option contained ${text}`);
}

async function waitForEnabled(locator, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await locator.isEnabled().catch(() => false)) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error("Timed out waiting for an Electron control to become enabled");
}

async function containsRawSecret(directory, secret) {
  const needle = Buffer.from(secret, "utf8");
  async function visit(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) {
        if (await visit(path)) return true;
      } else if (entry.isFile()) {
        const value = await readFile(path);
        if (value.includes(needle)) return true;
      }
    }
    return false;
  }
  return visit(directory);
}

function dismissShutdownDialogs(page) {
  page.on("dialog", (dialog) => void dialog.dismiss().catch(() => undefined));
}

async function main() {
  const credentials = await readCredentials();
  const adminKey = credentials.siteAdminKey;
  const client = await operatorClient(credentials);
  await prepareAuthorityEnrollment(client, adminKey);
  await mkdir(artifactRoot, { recursive: true });
  const [playwrightEntry, electronExecutable] = await Promise.all([
    resolveBunPackage("playwright@", "node_modules/playwright/index.mjs"),
    resolveBunPackage("electron@", "node_modules/electron/dist/Electron.app/Contents/MacOS/Electron"),
  ]);
  const { _electron } = await import(pathToFileURL(playwrightEntry).href);

  const temporaryProfile = await mkdtemp(join(tmpdir(), "convexpress-site-manager-electron-"));
  const expectedUserData = join(temporaryProfile, "-dev");
  await mkdir(expectedUserData, { recursive: true });
  await writeFile(
    join(expectedUserData, "convexpress-config.json"),
    JSON.stringify({ setupComplete: true, mode: "existing", convexUrl: B_ORIGIN, convexSiteUrl: B_SITE_ORIGIN }),
    "utf8",
  );

  const launchEnvironment = buildElectronAcceptanceEnvironment(process.env, {
    CONVEXPRESS_DESKTOP_DEV: "1",
    CONVEXPRESS_DESKTOP_DEV_URL: RENDERER_ORIGIN,
  });

  let electronApp;
  let traceStarted = false;
  let phase = "launch";
  const rendererErrors = [];
  const failedRequests = [];
  let secretSeenInRendererRequest = false;
  let securePromptVerified = false;
  let connectionRevoked = false;
  let acceptanceHierarchy = null;
  let hierarchyCleaned = false;
  let baselineRestored = false;
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
    const page = await electronApp.firstWindow();
    dismissShutdownDialogs(page);
    page.on("console", (message) => {
      if (message.type() === "error") rendererErrors.push(message.text());
    });
    page.on("requestfailed", (request) => failedRequests.push(`${request.method()} ${request.url()}`));
    page.on("request", (request) => {
      const body = request.postData() ?? "";
      if (request.url().includes(adminKey) || body.includes(adminKey)) secretSeenInRendererRequest = true;
    });
    await page.waitForLoadState("domcontentloaded");
    const actualUserData = await electronApp.evaluate(({ app }) => app.getPath("userData"));
    if ((await realpath(actualUserData)) !== (await realpath(expectedUserData))) {
      throw new Error("Electron site-manager profile was not isolated");
    }

    phase = "authenticate";
    await page.getByRole("textbox", { name: /email/i }).fill(credentials.email);
    await page.getByLabel(/^password$/i).fill(credentials.password);
    await page.getByRole("button", { name: /sign in|continue/i }).click();
    await waitForShell(page);
    await selectScope(page, {
      organization: "Acceptance Agency Group",
      business: "Northstar Commerce",
      website: "Northstar Shop",
      environment: "Live",
    });

    phase = "open-manager";
    const manager = await openSiteManager(page);
    await manager.getByRole("navigation", { name: "Portfolio" }).getByText("Acceptance Agency Group", { exact: true }).first().waitFor({ state: "visible", timeout: 15_000 });
    await manager.getByRole("button", { name: "New organization", exact: true }).first().waitFor({ state: "visible", timeout: 15_000 });
    await page.screenshot({ path: join(artifactRoot, "electron-site-manager-portfolio.png"), type: "png" });

    phase = "secure-credential-window";
    await manager.getByRole("navigation", { name: "Portfolio" }).getByRole("button", { name: /Northstar Shop/ }).first().click();
    const liveCard = manager.getByRole("article", { name: "Live environment" });
    await liveCard.waitFor({ state: "visible", timeout: 20_000 });
    await liveCard.getByRole("button", { name: "Connect", exact: true }).click();
    const connectDialog = page.getByRole("dialog");
    await connectDialog.getByLabel("Connection name").fill("Electron acceptance controller");
    await connectDialog.getByLabel(/^Account label/).fill(ACCEPTANCE_CONNECTION_LABEL);
    const promptPromise = electronApp.waitForEvent("window", { timeout: 15_000 });
    await connectDialog.getByRole("button", { name: "Enter key in protected window" }).click();
    const credentialWindow = await promptPromise;
    await credentialWindow.waitForLoadState("domcontentloaded");
    if (!credentialWindow.url().startsWith("file:")) {
      throw new Error("Deployment credential prompt was not an isolated Electron file window");
    }
    const promptSecurity = await electronApp.evaluate(async ({ BrowserWindow }, promptUrl) => {
      const win = BrowserWindow.getAllWindows().find(
        (candidate) => candidate.webContents.getURL() === promptUrl,
      );
      if (!win) return { found: false };
      const preferences = win?.webContents.getLastWebPreferences();
      win.webContents.openDevTools({ mode: "detach" });
      await new Promise((resolveWait) => setTimeout(resolveWait, 100));
      const devToolsOpened = win.webContents.isDevToolsOpened();
      if (devToolsOpened) win.webContents.closeDevTools();
      return {
        found: true,
        nodeIntegration: preferences?.nodeIntegration,
        contextIsolation: preferences?.contextIsolation,
        sandbox: preferences?.sandbox,
        devToolsBlocked: !devToolsOpened,
      };
    }, credentialWindow.url());
    const promptSurface = await credentialWindow.evaluate(() => ({
      submitExposed: typeof window.secureCredential?.submit === "function",
      requireHidden: typeof window.require === "undefined",
      processHidden: typeof window.process === "undefined",
    }));
    securePromptVerified =
      credentialWindow.url().startsWith("file:") &&
      promptSecurity.nodeIntegration !== true &&
      promptSecurity.contextIsolation === true &&
      promptSecurity.sandbox === true &&
      promptSecurity.devToolsBlocked === true &&
      promptSurface.submitExposed &&
      promptSurface.requireHidden &&
      promptSurface.processHidden;
    if (!securePromptVerified) {
      throw new Error(
        `Secure credential prompt isolation failed: ${JSON.stringify({ promptSecurity, promptSurface })}`,
      );
    }
    await credentialWindow.getByLabel("Deployment admin key").fill(adminKey);
    const closed = credentialWindow.waitForEvent("close", { timeout: 30_000 });
    await credentialWindow.getByRole("button", { name: "Connect securely" }).click();
    await closed;
    await manager.getByText("Controller authority enrolled and encrypted.", { exact: true }).waitFor({ state: "visible", timeout: 30_000 });

    const context = page.context();
    await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
    traceStarted = true;

    phase = "test-and-rotate";
    const connectionCard = liveCard.getByRole("group", { name: "Controller connection Electron acceptance controller" });
    await connectionCard.waitFor({ state: "visible", timeout: 15_000 });
    await connectionCard.getByRole("button", { name: "Test" }).click();
    await manager.getByText("Connection health verified.", { exact: true }).waitFor({ state: "visible", timeout: 30_000 });
    await connectionCard.getByRole("button", { name: "Rotate" }).click();
    await manager.getByText("Controller signing authority rotated.", { exact: true }).waitFor({ state: "visible", timeout: 30_000 });
    await waitForEnabled(connectionCard.getByRole("button", { name: "Rotate" }));
    await page.screenshot({ path: join(artifactRoot, "electron-site-manager-authority.png"), type: "png" });

    phase = "revoke";
    await connectionCard.getByRole("button", { name: "Revoke" }).click();
    const revokeDialog = page.getByRole("dialog");
    const revocationPhrase = (await revokeDialog.locator("code").filter({ hasText: "REVOKE CONNECTION" }).textContent())?.trim();
    if (!revocationPhrase) throw new Error("Connection revocation phrase was not rendered");
    await revokeDialog.getByLabel("Connection revocation confirmation").fill(revocationPhrase);
    await revokeDialog.getByRole("button", { name: "Revoke authority" }).click();
    await manager.getByText("Controller authority revoked.", { exact: true }).waitFor({ state: "visible", timeout: 30_000 });
    connectionRevoked = true;

    phase = "create-hierarchy";
    const suffix = Date.now().toString(36);
    const organizationName = `Electron Portfolio ${suffix}`;
    const organizationSlug = `electron-portfolio-${suffix}`;
    const businessName = `Client Studio ${suffix}`;
    const businessSlug = `client-studio-${suffix}`;
    const websiteTitle = `Acceptance Site ${suffix}`;
    const websiteKey = `${businessSlug}:acceptance-site`;
    acceptanceHierarchy = { organizationSlug, businessSlug, websiteKey };
    await manager.getByRole("button", { name: "New organization", exact: true }).first().click();
    const organizationForm = page.getByRole("form", { name: "Create organization" });
    await organizationForm.getByLabel("Organization name").fill(organizationName);
    await organizationForm.getByLabel("Slug").fill(organizationSlug);
    await organizationForm.getByLabel(/^Description/).fill("Created and managed entirely through Electron acceptance.");
    await organizationForm.getByRole("button", { name: "Create organization" }).click();
    await manager.getByRole("heading", { name: organizationName, exact: true }).waitFor({ state: "visible", timeout: 30_000 });

    await manager.getByRole("button", { name: "New business", exact: true }).first().click();
    const businessForm = page.getByRole("form", { name: "Create business" });
    await businessForm.getByLabel("Business name").fill(businessName);
    await businessForm.getByLabel("Slug").fill(businessSlug);
    await businessForm.getByRole("button", { name: "Create business" }).click();
    await manager.getByRole("heading", { name: businessName, exact: true }).waitFor({ state: "visible", timeout: 30_000 });

    await manager.getByRole("button", { name: "Add website", exact: true }).first().click();
    const addDialog = page.getByRole("dialog");
    await addDialog.getByRole("form", { name: "Choose where the website belongs" }).waitFor({ state: "visible", timeout: 10_000 });
    await addDialog.getByRole("button", { name: "Continue", exact: true }).click();
    const websiteForm = addDialog.getByRole("form", { name: "Register website" });
    await websiteForm.waitFor({ state: "visible", timeout: 10_000 });
    await websiteForm.getByLabel("Website title").fill(websiteTitle);
    await websiteForm.getByLabel("Primary domain").fill(`${organizationSlug}.example.test`);
    await websiteForm.getByLabel("Portable website key").fill(websiteKey);
    await websiteForm.getByRole("button", { name: "Register website" }).click();

    phase = "attach-edit-archive-environment";
    const attach = addDialog.getByRole("form", { name: "Attach environment" });
    await attach.waitFor({ state: "visible", timeout: 30_000 });
    await attach.getByLabel("Environment kind").selectOption("staging");
    await attach.getByLabel("Label").fill("Acceptance Staging");
    await attach.getByLabel("Convex deployment URL").fill("http://192.0.2.10:5200");
    await attach.getByLabel("Convex site / management URL").fill("http://192.0.2.10:5201");
    await attach.getByLabel("Public website URL").fill(`https://staging-${organizationSlug}.example.test`);
    await attach.getByRole("button", { name: "Attach environment" }).click();
    await addDialog.getByRole("form", { name: "Connect controller" }).waitFor({ state: "visible", timeout: 30_000 });
    await addDialog.getByRole("button", { name: "Connect later", exact: true }).click();
    await addDialog.getByRole("button", { name: "View website page", exact: true }).click();
    await manager.getByRole("heading", { name: websiteTitle, exact: true }).waitFor({ state: "visible", timeout: 30_000 });
    const stagingCard = manager.getByRole("article", { name: "Acceptance Staging environment" });
    await stagingCard.waitFor({ state: "visible", timeout: 30_000 });
    await stagingCard.getByRole("button", { name: /More actions for/ }).click();
    await page.getByRole("menuitem", { name: "Edit addresses and versions" }).click();
    const editForm = page.getByRole("form", { name: "Edit environment" });
    await editForm.getByLabel("Label").fill("Acceptance Staging Edited");
    await editForm.getByRole("button", { name: "Save environment" }).click();
    await manager.getByText("Environment details updated.", { exact: true }).waitFor({ state: "visible", timeout: 30_000 });
    await page.screenshot({ path: join(artifactRoot, "electron-site-manager-environment.png"), type: "png" });
    const editedCard = manager.getByRole("article", { name: "Acceptance Staging Edited environment" });
    await editedCard.getByRole("button", { name: /More actions for/ }).click();
    await page.getByRole("menuitem", { name: "Archive environment" }).click();
    const archiveDialog = page.getByRole("dialog");
    const archivePhrase = (await archiveDialog.locator("code").filter({ hasText: "ARCHIVE ENVIRONMENT" }).textContent())?.trim();
    if (!archivePhrase) throw new Error("Environment archive phrase was not rendered");
    await archiveDialog.getByLabel("Environment archive confirmation").fill(archivePhrase);
    await archiveDialog.getByRole("button", { name: "Archive environment", exact: true }).click();
    await editedCard.waitFor({ state: "hidden", timeout: 30_000 });
    await page.screenshot({ path: join(artifactRoot, "electron-site-manager-complete.png"), type: "png" });

    phase = "secret-and-storage-audit";
    await context.tracing.stop({ path: join(artifactRoot, "site-manager-electron-acceptance.zip") });
    traceStarted = false;
    const rendererStorageContainsSecret = await page.evaluate((secret) => {
      const values = [
        ...Object.values(window.localStorage),
        ...Object.values(window.sessionStorage),
      ];
      return values.some((value) => String(value).includes(secret));
    }, adminKey);
    if (rendererStorageContainsSecret || secretSeenInRendererRequest) {
      throw new Error("Deployment credential reached renderer storage or network");
    }
    await quitOwnedElectron(electronApp);
    electronApp = null;
    if (await containsRawSecret(temporaryProfile, adminKey)) {
      throw new Error("Deployment credential was persisted in the Electron profile");
    }
    if (await containsRawSecret(artifactRoot, adminKey)) {
      throw new Error("Deployment credential was written to an acceptance artifact");
    }
    await cleanupAcceptanceHierarchy(client, acceptanceHierarchy);
    hierarchyCleaned = true;
    await ensureBaselineConnection(client, adminKey);
    baselineRestored = true;

    process.stdout.write(`${JSON.stringify({
      acceptanceMode: "site-manager-electron",
      electronWindow: true,
      isolatedProfile: true,
      portfolioCreated: true,
      businessCreated: true,
      websiteRegistered: true,
      environmentAttached: true,
      environmentEdited: true,
      environmentArchivedWithConfirmation: true,
      secureCredentialWindow: securePromptVerified,
      rendererReceivedDeploymentCredential: false,
      rawCredentialPersisted: false,
      rawCredentialInArtifacts: false,
      controllerAuthorityGranted: true,
      connectionHealthTested: true,
      controllerAuthorityRotated: true,
      controllerAuthorityRevoked: connectionRevoked,
      disposableHierarchyCleaned: hierarchyCleaned,
      baselineAuthorityRestoredAndHealthy: baselineRestored,
      failedRendererRequests: failedRequests.length,
      rendererErrorCount: rendererErrors.length,
    })}\n`);
  } catch (error) {
    const page = electronApp?.windows()[0];
    if (page) {
      await page.screenshot({ path: join(artifactRoot, "electron-site-manager-failure.png"), type: "png" }).catch(() => undefined);
    }
    throw new Error(JSON.stringify({
      message: error instanceof Error ? error.message : String(error),
      phase,
      rendererErrorCount: rendererErrors.length,
      rendererErrors: rendererErrors.slice(0, 5),
      failedRequests: failedRequests.slice(0, 10),
    }));
  } finally {
    if (traceStarted && electronApp) {
      await electronApp.windows()[0]?.context().tracing.stop({ path: join(artifactRoot, "site-manager-electron-acceptance-failed.zip") }).catch(() => undefined);
    }
    await quitOwnedElectron(electronApp).catch(() => undefined);
    await cleanupAcceptanceConnections(client).catch(() => undefined);
    if (!baselineRestored) {
      await ensureBaselineConnection(client, adminKey).catch(() => undefined);
    }
    if (!hierarchyCleaned) {
      await cleanupAcceptanceHierarchy(client, acceptanceHierarchy).catch(() => undefined);
    }
    await rm(temporaryProfile, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
