import { randomBytes } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
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
const CONTROL_ORIGIN = fleet.control.deploymentOrigin;
const CONTROL_SITE_ORIGIN = fleet.control.siteOrigin;
const RENDERER_ORIGIN = fleet.rendererOrigin;
const TARGET_ORGANIZATION = "Acceptance Agency Group";
const TARGET_BUSINESS = "Northstar Commerce";
const TARGET_WEBSITE_KEY = "acceptance:northstar:shop";

const listOrganizations = makeFunctionReference("organizations:list");
const createOrganization = makeFunctionReference("organizations:create");
const updateOrganization = makeFunctionReference("organizations:update");
const listBusinesses = makeFunctionReference("businesses:list");
const listWebsites = makeFunctionReference("websites:list");
const listInstances = makeFunctionReference("websiteInstances:list");
const listOperators = makeFunctionReference("operators:list");
const setOperatorActive = makeFunctionReference("operators:setActive");
const setActiveContext = makeFunctionReference("context:setActive");
const checkMyAccess = makeFunctionReference("rbac/queries:checkMyAccess");
const updateWebsite = makeFunctionReference("websites:update");
const upsertPermission = makeFunctionReference("rbac/mutations:upsertPermission");
const setPermissionStatus = makeFunctionReference("rbac/mutations:setPermissionStatus");
const listConnections = makeFunctionReference("connections/queries:listForInstance");
const createConnection = makeFunctionReference("connections/actions:create");
const revokeConnection = makeFunctionReference("connections/actions:revoke");
const exchangeSiteSession = makeFunctionReference("siteBroker/session:exchange");
const getSiteCurrentUser = makeFunctionReference("users:getCurrentUser");

const requireFromControlPlane = createRequire(
  new URL("../../control-plane/package.json", import.meta.url),
);
const { convexClient, crossDomainClient } = requireFromControlPlane(
  "@convex-dev/better-auth/client/plugins",
);
const { createAuthClient } = requireFromControlPlane("better-auth/client");

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
    typeof parsed.siteAdminKeys?.alpha !== "string" ||
    typeof parsed.siteAdminKeys?.beta !== "string" ||
    typeof parsed.siteAdminKeys?.gamma !== "string"
  ) {
    throw new Error("Electron RBAC owner credentials were not provided");
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
    baseURL: CONTROL_SITE_ORIGIN,
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
  if (error) throw new Error("Control-plane RBAC login failed");
  const cookie = auth.getCookie();
  if (!cookie) throw new Error("Control-plane RBAC cookie was not issued");
  const response = await fetch(`${CONTROL_SITE_ORIGIN}/api/auth/convex/token`, {
    headers: { accept: "application/json", cookie, origin: RENDERER_ORIGIN },
  });
  if (!response.ok) throw new Error("Control-plane RBAC token exchange failed");
  const body = await response.json();
  if (typeof body.token !== "string" || body.token.length < 100) {
    throw new Error("Control-plane RBAC token was invalid");
  }
  return body.token;
}

async function operatorClient(credentials) {
  const client = new ConvexHttpClient(CONTROL_ORIGIN);
  client.setAuth(await getControlToken(credentials));
  return client;
}

function dismissShutdownDialogs(page) {
  page.on("dialog", (dialog) => void dialog.dismiss().catch(() => undefined));
}

function safeRendererErrorSummary(errors) {
  return errors
    .map((error) =>
      error
        .replace(/https?:\/\/\S+/gu, "[url]")
        .replace(/[A-Za-z0-9_-]{40,}/gu, "[redacted]"),
    )
    .join(" | ")
    .slice(0, 1_000);
}

async function launchElectron(_electron, profileLabel) {
  const temporaryProfile = await mkdtemp(join(tmpdir(), `convexpress-rbac-${profileLabel}-`));
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
  const electronExecutable = await resolveBunPackage(
    "electron@",
    "node_modules/electron/dist/Electron.app/Contents/MacOS/Electron",
  );
  const electronApp = await _electron.launch({
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
  const rendererErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") rendererErrors.push(message.text());
  });
  await page.waitForLoadState("domcontentloaded");
  const actualUserData = await electronApp.evaluate(({ app }) => app.getPath("userData"));
  if ((await realpath(actualUserData)) !== (await realpath(expectedUserData))) {
    throw new Error(`Electron ${profileLabel} profile was not isolated`);
  }
  return { electronApp, page, temporaryProfile, rendererErrors };
}

async function signInThroughElectron(page, credentials) {
  await page.getByRole("textbox", { name: /email/i }).fill(credentials.email);
  await page.getByLabel(/^password$/i).fill(credentials.password);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await waitForShell(page);
}

async function claimThroughElectron(page, account) {
  await page.getByRole("button", { name: "Have an operator invitation? Claim it" }).click();
  await page.getByRole("textbox", { name: /email/i }).fill(account.email);
  await page.getByLabel("Name", { exact: true }).fill(account.name);
  await page.getByLabel("Invitation code", { exact: true }).fill(account.claimSecret);
  await page.getByLabel(/^password$/i).fill(account.password);
  await page.getByRole("button", { name: "Claim invitation", exact: true }).click();
  await waitForShell(page);
}

async function optionLabels(select) {
  return await select.locator("option").evaluateAll((options) =>
    options.filter((option) => option.value).map((option) => option.textContent?.trim() ?? ""),
  );
}

async function selectTargetScope(page, target) {
  await selectScope(page, {
    organization: target.organization.name,
    business: target.business.name,
    website: target.website.title,
    environment: target.environment.label ?? target.environment.kind,
  });
}

async function openPeoplePanel(page) {
  const manager = await openSiteManager(page);
  await manager.getByRole("navigation", { name: "Portfolio" }).getByRole("button", { name: /^People$/ }).click();
  await manager.getByRole("heading", { name: "People", exact: true }).waitFor({ state: "visible", timeout: 10_000 });
  return manager;
}

async function expectRejected(work, label) {
  try {
    await work();
  } catch {
    return true;
  }
  throw new Error(`${label} unexpectedly succeeded`);
}

async function findTarget(client) {
  const organizations = await client.query(listOrganizations, {});
  const organization = organizations.find((entry) => entry.name === TARGET_ORGANIZATION);
  if (!organization) throw new Error("RBAC target organization is unavailable");
  const businesses = await client.query(listBusinesses, {
    organizationId: organization.organizationId,
  });
  const business = businesses.find((entry) => entry.name === TARGET_BUSINESS);
  if (!business) throw new Error("RBAC target business is unavailable");
  const websites = await client.query(listWebsites, { businessId: business.businessId });
  const website = websites.find((entry) => entry.websiteKey === TARGET_WEBSITE_KEY);
  if (!website) throw new Error("RBAC target website is unavailable");
  const environments = await client.query(listInstances, { websiteId: website.websiteId });
  const environment = environments.find((entry) => entry.kind === "staging") ?? environments[0];
  if (!environment) throw new Error("RBAC target environment is unavailable");
  const siblingOrganization = organizations.find(
    (entry) => entry.organizationId !== organization.organizationId,
  );
  if (!siblingOrganization) throw new Error("RBAC sibling organization is unavailable");
  return { organization, business, website, environment, siblingOrganization, organizationCount: organizations.length };
}

async function ensureSiblingOrganization(client, suffix) {
  const organizations = await client.query(listOrganizations, {});
  const target = organizations.find((entry) => entry.name === TARGET_ORGANIZATION);
  if (!target) throw new Error("RBAC target organization is unavailable");
  const existing = organizations.find(
    (entry) => entry.organizationId !== target.organizationId,
  );
  if (existing) return { organization: existing, created: false };
  const organization = await client.mutation(createOrganization, {
    name: `Electron RBAC Sibling ${suffix}`,
    slug: `electron-rbac-sibling-${suffix}`,
    description: "Disposable out-of-scope organization for Electron RBAC acceptance.",
  });
  return { organization, created: true };
}

function fleetAdminKey(credentials, environment) {
  const endpoint = fleet.sites.find(
    (candidate) =>
      candidate.deploymentOrigin === environment.deploymentOrigin &&
      candidate.siteOrigin === environment.managementOrigin,
  );
  if (!endpoint) {
    throw new Error("The RBAC target is not one of the isolated Linux Worker sites");
  }
  return credentials.siteAdminKeys[endpoint.key];
}

function directSiteOrigin(environment) {
  const configured = process.env.CONVEXPRESS_ACCEPTANCE_SITE_DIRECT_ORIGIN?.trim();
  if (!configured) return environment.deploymentOrigin;
  const parsed = new URL(configured);
  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error("The direct RBAC site endpoint must be an HTTP(S) origin");
  }
  return parsed.origin;
}

async function ensureAcceptanceConnection(client, target, credentials) {
  const connections = await client.query(listConnections, {
    instanceId: target.environment.instanceId,
  });
  const active = connections.find(
    (candidate) => candidate.isActive && candidate.status === "connected",
  );
  if (active) return { connectionId: active.connectionId, created: false };
  const created = await client.action(createConnection, {
    instanceId: target.environment.instanceId,
    name: "Electron RBAC revocation acceptance",
    accountLabel: "Disposable RBAC session authority",
    deploymentAdminKey: fleetAdminKey(credentials, target.environment),
  });
  return { connectionId: created.connectionId, created: true };
}

function accessArgs(target, code) {
  return {
    selectorType: "capability",
    code,
    organizationId: String(target.organization.organizationId),
    businessId: String(target.business.businessId),
    websiteId: String(target.website.websiteId),
    instanceId: String(target.environment.instanceId),
  };
}

async function main() {
  const ownerCredentials = await readCredentials();
  await mkdir(artifactRoot, { recursive: true });
  const playwrightEntry = await resolveBunPackage(
    "playwright@",
    "node_modules/playwright/index.mjs",
  );
  const { _electron } = await import(pathToFileURL(playwrightEntry).href);
  const ownerClient = await operatorClient(ownerCredentials);
  const suffix = `${Date.now().toString(36)}-${randomBytes(4).toString("hex")}`;
  const password = `Cv!${randomBytes(18).toString("base64url")}`;
  const accounts = [
    { key: "admin", profile: "administrator", name: "Electron RBAC Administrator" },
    { key: "business-manager", profile: "business-manager", name: "Electron RBAC Business Manager" },
    { key: "site-operator", profile: "site-operator", name: "Electron RBAC Site Operator" },
    { key: "member", profile: "member", name: "Electron RBAC Member" },
    { key: "viewer", profile: "viewer", name: "Electron RBAC Viewer" },
  ].map((account) => ({
    ...account,
    email: `cvpr-rbac-${account.key}-${suffix}@example.test`,
    password,
  }));
  const electronRuns = [];
  const operatorIds = [];
  const tracePaths = [];
  let denyPermissionId = null;
  let siteOperatorSiteSession = null;
  let acceptanceConnection = null;
  let target = null;
  let disposableSiblingId = null;
  let disposableSiblingCleaned = false;
  let phase = "owner-launch";

  try {
    phase = "prepare-sibling-scope";
    const sibling = await ensureSiblingOrganization(ownerClient, suffix);
    if (sibling.created) disposableSiblingId = sibling.organization.organizationId;
    target = await findTarget(ownerClient);
    const ownerRun = await launchElectron(_electron, "owner");
    electronRuns.push(ownerRun);
    await signInThroughElectron(ownerRun.page, ownerCredentials);
    await selectTargetScope(ownerRun.page, target);
    acceptanceConnection = await ensureAcceptanceConnection(
      ownerClient,
      target,
      ownerCredentials,
    );
    const ownerManager = await openPeoplePanel(ownerRun.page);
    await ownerManager.getByText("Owner", { exact: true }).first().waitFor({
      state: "visible",
      timeout: 15_000,
    });

    phase = "provision-through-electron";
    for (const account of accounts) {
      await ownerManager.getByRole("button", { name: "Invite operator", exact: true }).first().click();
      const inviteDialog = ownerRun.page.getByRole("dialog");
      await inviteDialog.getByRole("form", { name: "Invite operator" }).waitFor({ state: "visible", timeout: 10_000 });
      await inviteDialog.getByLabel(/^Name/).fill(account.name);
      await inviteDialog.getByLabel("Login email").fill(account.email);
      await inviteDialog.getByLabel("Outer access role").selectOption(account.profile);
      await inviteDialog.getByRole("button", { name: "Prepare operator invitation" }).click();
      const receipt = inviteDialog.getByRole("complementary", {
        name: "One-time operator invitation",
      });
      await receipt.waitFor({ state: "visible", timeout: 30_000 });
      await receipt.filter({ hasText: account.email }).waitFor({
        state: "visible",
        timeout: 30_000,
      });
      const backendOperators = await ownerClient.query(listOperators, { limit: 200 });
      if (!backendOperators.some((entry) => entry.email === account.email)) {
        throw new Error(`Provisioned ${account.key} operator was not persisted`);
      }
      const claimSecret = (
        await receipt.locator("output").textContent()
      )?.trim();
      await inviteDialog.getByRole("button", { name: "Done", exact: true }).click();
      await ownerManager.getByRole("listitem", { name: `Operator ${account.email}` }).waitFor({
        state: "visible",
        timeout: 30_000,
      });
      if (!claimSecret || !/^[A-Za-z0-9_-]{43}$/u.test(claimSecret)) {
        throw new Error(`Provisioned ${account.key} invitation code is unavailable`);
      }
      account.claimSecret = claimSecret;
    }
    await ownerRun.page.screenshot({
      path: join(artifactRoot, "electron-rbac-owner-people.png"),
      type: "png",
    });
    const provisioned = await ownerClient.query(listOperators, { limit: 200 });
    for (const account of accounts) {
      const operator = provisioned.find((entry) => entry.email === account.email);
      if (!operator) throw new Error(`Provisioned ${account.key} operator is missing`);
      operatorIds.push(operator.userId);
    }
    await quitOwnedElectron(ownerRun.electronApp);
    await rm(ownerRun.temporaryProfile, { recursive: true, force: true });
    electronRuns.splice(electronRuns.indexOf(ownerRun), 1);

    for (const account of accounts) {
      phase = `${account.key}-claim-electron`;
      const run = await launchElectron(_electron, account.key);
      electronRuns.push(run);
      await claimThroughElectron(run.page, account);
      const tracePath = join(artifactRoot, `electron-rbac-${account.key}.zip`);
      await run.page.context().tracing.start({ screenshots: true, snapshots: true, sources: true });
      tracePaths.push(tracePath);

      const visibleOrganizations = await listSwitcherOrganizations(run.page);
      if (account.key === "admin") {
        if (visibleOrganizations.length !== target.organizationCount) {
          throw new Error("Administrator did not receive the complete organization portfolio");
        }
      } else if (
        visibleOrganizations.length !== 1 ||
        visibleOrganizations[0] !== target.organization.name
      ) {
        throw new Error(`${account.key} received an organization outside its assignment`);
      }
      await selectTargetScope(run.page, target);
      const expectsOperations = ["admin", "business-manager", "site-operator"].includes(
        account.key,
      );
      await run.page.waitForTimeout(expectsOperations ? 2_000 : 1_000);
      const operationsVisible = await environmentActionAvailable(run.page, "Site operations");
      if (operationsVisible !== expectsOperations) {
        throw new Error(`${account.key} lifecycle launcher visibility was incorrect`);
      }
      const expectsHandoff = ["admin", "business-manager"].includes(account.key);
      const handoffVisible = await environmentActionAvailable(run.page, "Transfer site");
      if (handoffVisible !== expectsHandoff) {
        throw new Error(`${account.key} handoff launcher visibility was incorrect`);
      }
      const manager = await openPeoplePanel(run.page);
      const expectedLabel = {
        admin: "Administrator",
        "business-manager": "Business Manager",
        "site-operator": "Site Operator",
        member: "Member",
        viewer: "Viewer",
      }[account.key];
      await manager.getByText(expectedLabel, { exact: true }).first().waitFor({
        state: "visible",
        timeout: 15_000,
      });
      if (account.key === "admin") {
        await manager.getByText("Current operators", { exact: true }).waitFor({ state: "visible" });
        await manager.getByRole("button", { name: "Invite operator", exact: true }).first().waitFor({ state: "visible" });
      } else {
        await manager.getByText(/Only the installation owner or an administrator/).waitFor({
          state: "visible",
        });
      }
      await run.page.screenshot({
        path: join(artifactRoot, `electron-rbac-${account.key}.png`),
        type: "png",
      });

      phase = `${account.key}-backend-authorization`;
      const client = await operatorClient(account);
      const rbac = await client.query(checkMyAccess, accessArgs(target, "rbac.manage"));
      if (rbac.allowed !== (account.key === "admin")) {
        throw new Error(`${account.key} rbac.manage decision was incorrect`);
      }
      if (account.key === "business-manager") {
        const businessUpdate = await client.query(
          checkMyAccess,
          accessArgs(target, "business.update"),
        );
        const websiteUpdate = await client.query(
          checkMyAccess,
          accessArgs(target, "website.update"),
        );
        const liveOperate = await client.query(
          checkMyAccess,
          accessArgs(target, "environment.live.operate"),
        );
        if (!businessUpdate.allowed || !websiteUpdate.allowed || liveOperate.allowed) {
          throw new Error("Business Manager capability boundary was incorrect");
        }
        await client.mutation(updateWebsite, {
          websiteId: target.website.websiteId,
          title: target.website.title,
        });
        await expectRejected(
          () => client.mutation(setActiveContext, {
            organizationId: target.siblingOrganization.organizationId,
            businessId: null,
            websiteId: null,
            instanceId: null,
          }),
          "Business Manager sibling scope selection",
        );

        const operator = provisioned.find((entry) => entry.email === account.email);
        denyPermissionId = await ownerClient.mutation(upsertPermission, {
          subjectType: "user",
          subjectId: String(operator.userId),
          selectorType: "capability",
          selectorCode: "website.update",
          effect: "deny",
          status: "active",
          organizationId: String(target.organization.organizationId),
          businessId: String(target.business.businessId),
          websiteId: String(target.website.websiteId),
          includeChildren: true,
        });
        await manager.getByRole("button", { name: /Portfolio/ }).click();
        await manager.getByText("Edit website", { exact: true }).waitFor({ state: "hidden", timeout: 15_000 });
        const denied = await client.query(
          checkMyAccess,
          accessArgs(target, "website.update"),
        );
        if (denied.allowed || denied.reason !== "explicit_deny") {
          throw new Error("Explicit website deny did not override the Business Manager role");
        }
        await expectRejected(
          () => client.mutation(updateWebsite, {
            websiteId: target.website.websiteId,
            title: target.website.title,
          }),
          "Explicitly denied website update",
        );
        await ownerClient.mutation(setPermissionStatus, {
          permissionId: denyPermissionId,
          status: "revoked",
        });
        denyPermissionId = null;
      }
      if (account.key === "site-operator") {
        const connectionManage = await client.query(
          checkMyAccess,
          accessArgs(target, "connection.manage"),
        );
        const websiteUpdate = await client.query(
          checkMyAccess,
          accessArgs(target, "website.update"),
        );
        const liveOperate = await client.query(
          checkMyAccess,
          accessArgs(target, "environment.live.operate"),
        );
        if (!connectionManage.allowed || websiteUpdate.allowed || liveOperate.allowed) {
          throw new Error("Site Operator capability boundary was incorrect");
        }
        const session = await client.action(exchangeSiteSession, {
          connectionId: acceptanceConnection.connectionId,
          requestedCapabilities: ["health.read", "compatibility.read"],
          requestedSiteRole: "administrator",
        });
        const siteClient = new ConvexHttpClient(
          directSiteOrigin(target.environment),
        );
        siteClient.setAuth(session.token);
        const currentSiteUser = await siteClient.query(getSiteCurrentUser, {});
        if (!currentSiteUser?.isInternal) {
          throw new Error("Site Operator did not receive an active site management session");
        }
        siteOperatorSiteSession = {
          token: session.token,
          deploymentOrigin: directSiteOrigin(target.environment),
        };
      }
      if (account.key === "member") {
        const contentManage = await client.query(
          checkMyAccess,
          accessArgs(target, "site.content.manage"),
        );
        const websiteUpdate = await client.query(
          checkMyAccess,
          accessArgs(target, "website.update"),
        );
        if (!contentManage.allowed || contentManage.roleSlug !== "member" || websiteUpdate.allowed) {
          throw new Error("Member capability boundary was incorrect");
        }
      }
      if (account.key === "viewer") {
        const siteRead = await client.query(checkMyAccess, accessArgs(target, "site.read"));
        const contentRead = await client.query(
          checkMyAccess,
          accessArgs(target, "site.content.read"),
        );
        const websiteUpdate = await client.query(
          checkMyAccess,
          accessArgs(target, "website.update"),
        );
        if (!siteRead.allowed || contentRead.allowed || websiteUpdate.allowed) {
          throw new Error("Viewer capability boundary was incorrect");
        }
      }

      await run.page.context().tracing.stop({ path: tracePath });
      await quitOwnedElectron(run.electronApp);
      await rm(run.temporaryProfile, { recursive: true, force: true });
      electronRuns.splice(electronRuns.indexOf(run), 1);
      if (run.rendererErrors.length) {
        throw new Error(
          `${account.key} Electron renderer emitted errors: ${safeRendererErrorSummary(run.rendererErrors)}`,
        );
      }
    }

    if (!siteOperatorSiteSession) {
      throw new Error("Site Operator revocation fixture was not established");
    }
    phase = "owner-deactivate-site-operator-electron";
    const deactivationRun = await launchElectron(_electron, "owner-deactivation");
    electronRuns.push(deactivationRun);
    await signInThroughElectron(deactivationRun.page, ownerCredentials);
    await selectTargetScope(deactivationRun.page, target);
    const deactivationManager = await openPeoplePanel(deactivationRun.page);
    const siteOperatorAccount = accounts.find((account) => account.key === "site-operator");
    if (!siteOperatorAccount) throw new Error("Site Operator account is unavailable");
    const siteOperatorArticle = deactivationManager.getByRole("listitem", {
      name: `Operator ${siteOperatorAccount.email}`,
    });
    await siteOperatorArticle.getByRole("button", { name: "Deactivate" }).click();
    await siteOperatorArticle.getByText("Inactive", { exact: true }).waitFor({
      state: "visible",
      timeout: 15_000,
    });
    const revokedSiteClient = new ConvexHttpClient(
      siteOperatorSiteSession.deploymentOrigin,
    );
    revokedSiteClient.setAuth(siteOperatorSiteSession.token);
    const revocationDeadline = Date.now() + 20_000;
    let revoked = false;
    while (Date.now() < revocationDeadline) {
      const current = await revokedSiteClient
        .query(getSiteCurrentUser, {})
        .catch(() => null);
      if (current === null) {
        revoked = true;
        break;
      }
      await new Promise((resolveWait) => setTimeout(resolveWait, 250));
    }
    if (!revoked) {
      throw new Error("Deactivated Site Operator retained an issued site session");
    }
    await quitOwnedElectron(deactivationRun.electronApp);
    await rm(deactivationRun.temporaryProfile, { recursive: true, force: true });
    electronRuns.splice(electronRuns.indexOf(deactivationRun), 1);

    for (const userId of operatorIds) {
      await ownerClient.mutation(setOperatorActive, { userId, isActive: false });
    }
    if (acceptanceConnection?.created) {
      await ownerClient.action(revokeConnection, {
        connectionId: acceptanceConnection.connectionId,
      });
      acceptanceConnection = null;
    }
    for (const tracePath of tracePaths) {
      const bytes = await readFile(tracePath);
      if (bytes.includes(Buffer.from(password)) || bytes.includes(Buffer.from(ownerCredentials.password))) {
        throw new Error("An RBAC acceptance trace retained a raw password");
      }
    }
    if (disposableSiblingId) {
      await ownerClient.mutation(updateOrganization, {
        organizationId: disposableSiblingId,
        isActive: false,
      });
      disposableSiblingId = null;
    }
    disposableSiblingCleaned = true;

    process.stdout.write(`${JSON.stringify({
      acceptanceMode: "electron-rbac-matrix",
      electronOnly: true,
      ownerProvisionedRolesInUi: true,
      invitationClaimedInElectron: true,
      administratorPortfolioVerified: true,
      businessManagerScopeVerified: true,
      siteOperatorScopeVerified: true,
      memberScopeVerified: true,
      viewerScopeVerified: true,
      explicitDenyWinsVerified: true,
      forgedSiblingScopeRejected: true,
      websiteCustomerAuthRemainsSeparate: true,
      issuedSiteSessionRevokedOnDeactivation: true,
      temporaryOperatorsDeactivated: true,
      disposableSiblingOrganizationCleaned: disposableSiblingCleaned,
      rendererErrorCount: 0,
    })}\n`);
  } catch (error) {
    const activeRun = electronRuns.at(-1);
    if (activeRun) {
      await activeRun.page.screenshot({
        path: join(artifactRoot, "electron-rbac-failure.png"),
        type: "png",
      }).catch(() => undefined);
    }
    process.stderr.write(`Electron RBAC acceptance failed during ${phase}: ${error instanceof Error ? error.message : String(error)}\n`);
    throw error;
  } finally {
    if (denyPermissionId) {
      await ownerClient.mutation(setPermissionStatus, {
        permissionId: denyPermissionId,
        status: "revoked",
      }).catch(() => undefined);
    }
    if (acceptanceConnection?.created) {
      await ownerClient.action(revokeConnection, {
        connectionId: acceptanceConnection.connectionId,
      }).catch(() => undefined);
    }
    if (disposableSiblingId) {
      await ownerClient.mutation(updateOrganization, {
        organizationId: disposableSiblingId,
        isActive: false,
      }).catch(() => undefined);
    }
    const currentOperators = await ownerClient.query(listOperators, { limit: 200 }).catch(() => []);
    for (const operator of currentOperators) {
      if (operator.email?.includes(`-${suffix}@example.test`) && operator.isActive) {
        await ownerClient.mutation(setOperatorActive, {
          userId: operator.userId,
          isActive: false,
        }).catch(() => undefined);
      }
    }
    for (const run of electronRuns) {
      await quitOwnedElectron(run.electronApp).catch(() => undefined);
      await rm(run.temporaryProfile, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}

await main();
