import { mkdtemp, mkdir, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(scriptDirectory, "..");
const repositoryRoot = resolve(desktopRoot, "../..");
const artifactRoot = resolve(repositoryRoot, "../output/playwright");
const bunModulesRoot = join(repositoryRoot, "node_modules/.bun");
const B_ORIGIN = "http://127.0.0.1:4920";
const B_SITE_ORIGIN = "http://127.0.0.1:4921";
const RENDERER_ORIGIN = "http://127.0.0.1:4105";
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
const listInstances = makeFunctionReference("websiteInstances:list");
const listConnections = makeFunctionReference("connections/queries:listForInstance");
const revokeConnection = makeFunctionReference("connections/actions:revoke");

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
  if (!website) throw new Error("Northstar Shop is not registered in controller B");
  const environments = await client.query(listInstances, { websiteId: website.websiteId });
  const live = environments.find((entry) => entry.kind === "live");
  if (!live) throw new Error("Northstar Shop live is not registered in controller B");
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

async function fixtureAdminKey() {
  const config = JSON.parse(
    await readFile(
      resolve(repositoryRoot, "temp/site-fixtures/live/.convex/local/default/config.json"),
      "utf8",
    ),
  );
  if (typeof config.adminKey !== "string") throw new Error("Live fixture admin key is unavailable");
  return config.adminKey;
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

async function quitElectron(electronApp) {
  if (!electronApp) return;
  const child = electronApp.process();
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise((resolveExit) => child.once("exit", resolveExit));
  await electronApp.evaluate(({ app }) => app.exit(0)).catch(() => undefined);
  await Promise.race([exited, new Promise((resolveWait) => setTimeout(resolveWait, 5_000))]);
  if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
}

async function main() {
  const credentials = await readCredentials();
  const adminKey = await fixtureAdminKey();
  const client = await operatorClient(credentials);
  await cleanupAcceptanceConnections(client);
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

  const launchEnvironment = {
    ...process.env,
    CONVEXPRESS_DESKTOP_DEV: "1",
    CONVEXPRESS_DESKTOP_DEV_URL: RENDERER_ORIGIN,
  };
  delete launchEnvironment.ELECTRON_RUN_AS_NODE;

  let electronApp;
  let traceStarted = false;
  let phase = "launch";
  const rendererErrors = [];
  const failedRequests = [];
  let secretSeenInRendererRequest = false;
  let securePromptVerified = false;
  let connectionRevoked = false;
  try {
    electronApp = await _electron.launch({
      executablePath: electronExecutable,
      args: [`--user-data-dir=${temporaryProfile}`, desktopRoot],
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
    await page.getByLabel(/password/i).fill(credentials.password);
    await page.getByRole("button", { name: /sign in|continue/i }).click();
    const organizationSelect = page.getByRole("combobox", { name: "Organization" });
    await organizationSelect.waitFor({ state: "visible", timeout: 20_000 });
    await selectOptionContaining(organizationSelect, "Client Handoff Organization");
    const businessSelect = page.getByRole("combobox", { name: "Business" });
    await selectOptionContaining(businessSelect, "Client Owned Websites");
    const websiteSelect = page.getByRole("combobox", { name: "Website" });
    await selectOptionContaining(websiteSelect, "Northstar Shop");
    const environmentSelect = page.getByRole("combobox", { name: "Environment" });
    await selectOptionContaining(environmentSelect, "Live");

    phase = "open-manager";
    await page.getByRole("button", { name: "Manage sites" }).click();
    const manager = page.getByRole("complementary", { name: "Manage websites" });
    await manager.waitFor({ state: "visible", timeout: 10_000 });
    await manager.getByText("Client Handoff Organization", { exact: true }).first().waitFor({ state: "visible", timeout: 15_000 });
    await manager.getByText("New organization", { exact: true }).waitFor({ state: "visible", timeout: 15_000 });
    await page.screenshot({ path: join(artifactRoot, "electron-site-manager-portfolio.png"), type: "png" });

    phase = "secure-credential-window";
    await manager.getByRole("button", { name: /Authority/ }).click();
    await manager.getByText("this controller has no authority", { exact: false }).waitFor({ state: "visible", timeout: 15_000 });
    await manager.getByLabel("Connection name").fill("Electron acceptance controller");
    await manager.getByLabel("Account label").fill(ACCEPTANCE_CONNECTION_LABEL);
    const promptPromise = electronApp.waitForEvent("window", { timeout: 15_000 });
    await manager.getByRole("button", { name: "Enter key in protected window" }).click();
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
    const connectionCard = manager.getByRole("article", { name: "Controller connection Electron acceptance controller" });
    await connectionCard.waitFor({ state: "visible", timeout: 15_000 });
    await connectionCard.getByRole("button", { name: "Test" }).click();
    await manager.getByText("Connection health verified.", { exact: true }).waitFor({ state: "visible", timeout: 30_000 });
    await connectionCard.getByRole("button", { name: "Rotate" }).click();
    await manager.getByText("Controller signing authority rotated.", { exact: true }).waitFor({ state: "visible", timeout: 30_000 });
    await waitForEnabled(connectionCard.getByRole("button", { name: "Rotate" }));
    await page.screenshot({ path: join(artifactRoot, "electron-site-manager-authority.png"), type: "png" });

    phase = "revoke";
    await connectionCard.getByRole("button", { name: "Revoke" }).click();
    const revocationPhrase = (await manager.locator("code").filter({ hasText: "REVOKE CONNECTION" }).textContent())?.trim();
    if (!revocationPhrase) throw new Error("Connection revocation phrase was not rendered");
    await manager.getByLabel("Connection revocation confirmation").fill(revocationPhrase);
    await manager.getByRole("button", { name: "Revoke authority" }).click();
    await manager.getByText("Controller authority revoked.", { exact: true }).waitFor({ state: "visible", timeout: 30_000 });
    connectionRevoked = true;

    phase = "create-hierarchy";
    await manager.getByRole("button", { name: /Portfolio/ }).click();
    const suffix = Date.now().toString(36);
    const organizationName = `Electron Portfolio ${suffix}`;
    const organizationSlug = `electron-portfolio-${suffix}`;
    const businessName = `Client Studio ${suffix}`;
    const businessSlug = `client-studio-${suffix}`;
    const websiteTitle = `Acceptance Site ${suffix}`;
    const websiteKey = `${businessSlug}:acceptance-site`;
    const deploymentPort = 5_200 + (Date.now() % 300);
    const addRecords = manager.getByRole("region", { name: "Add portfolio records" });
    await addRecords.getByText("New organization", { exact: true }).click();
    const organizationForm = addRecords.getByRole("form", { name: "Create organization" });
    await organizationForm.getByLabel("Organization name").fill(organizationName);
    await organizationForm.getByLabel("Slug").fill(organizationSlug);
    await organizationForm.getByLabel("Description").fill("Created and managed entirely through Electron acceptance.");
    await organizationForm.getByRole("button", { name: "Create organization" }).click();
    await manager.getByText(organizationName, { exact: true }).first().waitFor({ state: "visible", timeout: 30_000 });

    const businessDetails = addRecords.locator("details").filter({
      hasText: `New business in ${organizationName}`,
    });
    await businessDetails.waitFor({ state: "attached", timeout: 15_000 });
    const businessForm = addRecords.getByRole("form", { name: "Create business" });
    if (!(await businessDetails.evaluate((details) => details.open))) {
      await businessDetails.locator("summary").click();
    }
    await businessForm.waitFor({ state: "visible", timeout: 10_000 });
    await businessForm.getByLabel("Business name").fill(businessName);
    await businessForm.getByLabel("Slug").fill(businessSlug);
    await businessForm.getByRole("button", { name: "Create business" }).click();
    await manager.getByText(businessName, { exact: true }).first().waitFor({ state: "visible", timeout: 30_000 });

    const websiteDetails = addRecords.locator("details").filter({
      hasText: `New website in ${businessName}`,
    });
    await websiteDetails.waitFor({ state: "attached", timeout: 15_000 });
    const websiteForm = addRecords.getByRole("form", { name: "Register website" });
    if (!(await websiteDetails.evaluate((details) => details.open))) {
      await websiteDetails.locator("summary").click();
    }
    await websiteForm.waitFor({ state: "visible", timeout: 10_000 });
    await websiteForm.getByLabel("Website title").fill(websiteTitle);
    await websiteForm.getByLabel("Portable website key").fill(websiteKey);
    await websiteForm.getByLabel("Primary domain").fill(`${organizationSlug}.example.test`);
    await websiteForm.getByRole("button", { name: "Register website" }).click();
    await manager.getByText(websiteTitle, { exact: true }).first().waitFor({ state: "visible", timeout: 30_000 });

    phase = "attach-edit-archive-environment";
    await manager.getByRole("button", { name: /Environment/ }).click();
    const attach = manager.getByRole("region", { name: "Attach environment" });
    await attach.getByLabel("Environment kind").selectOption("staging");
    await attach.getByLabel("Label").fill("Acceptance Staging");
    await attach.getByLabel("Convex deployment URL").fill(`http://127.0.0.1:${deploymentPort}`);
    await attach.getByLabel("Convex site / management URL").fill(`http://127.0.0.1:${deploymentPort + 1}`);
    await attach.getByLabel("Public website URL").fill(`https://staging-${organizationSlug}.example.test`);
    await attach.getByRole("button", { name: "Attach environment" }).click();
    const currentEnvironment = manager.getByRole("region", { name: "Current environment details" });
    await currentEnvironment.waitFor({ state: "visible", timeout: 30_000 });
    await currentEnvironment.getByLabel("Label").fill("Acceptance Staging Edited");
    await currentEnvironment.getByRole("button", { name: "Save environment" }).click();
    await manager.getByText("Environment details updated.", { exact: true }).waitFor({ state: "visible", timeout: 30_000 });
    await page.screenshot({ path: join(artifactRoot, "electron-site-manager-environment.png"), type: "png" });
    const archivePhrase = (await currentEnvironment.locator("code").filter({ hasText: "ARCHIVE ENVIRONMENT" }).textContent())?.trim();
    if (!archivePhrase) throw new Error("Environment archive phrase was not rendered");
    await currentEnvironment.getByLabel("Environment archive confirmation").fill(archivePhrase);
    await currentEnvironment.getByRole("button", { name: "Archive" }).click();
    await currentEnvironment.waitFor({ state: "hidden", timeout: 30_000 });
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
    await quitElectron(electronApp);
    electronApp = null;
    if (await containsRawSecret(temporaryProfile, adminKey)) {
      throw new Error("Deployment credential was persisted in the Electron profile");
    }
    if (await containsRawSecret(artifactRoot, adminKey)) {
      throw new Error("Deployment credential was written to an acceptance artifact");
    }

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
    await quitElectron(electronApp).catch(() => undefined);
    await cleanupAcceptanceConnections(client).catch(() => undefined);
    await rm(temporaryProfile, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
