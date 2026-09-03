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
import { requireSecondaryControl } from "./lib/test-fleet-config.mjs";

import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(scriptDirectory, "..");
const repositoryRoot = resolve(desktopRoot, "../..");
const artifactRoot = resolve(repositoryRoot, "../output/playwright");
const bunModulesRoot = join(repositoryRoot, "node_modules/.bun");
const handoffPackagePath = join(
  artifactRoot,
  "electron-northstar-handoff.json",
);

const fleet = requireSecondaryControl();
const A_ORIGIN = fleet.control.deploymentOrigin;
const A_SITE_ORIGIN = fleet.control.siteOrigin;
const B_ORIGIN = fleet.secondaryControl.deploymentOrigin;
const B_SITE_ORIGIN = fleet.secondaryControl.siteOrigin;
const RENDERER_ORIGIN = fleet.rendererOrigin;
const WEBSITE_KEY = "acceptance:northstar:shop";

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
const createConnection = makeFunctionReference("connections/actions:create");
const revokeConnection = makeFunctionReference("connections/actions:revoke");
const exchangeSiteSession = makeFunctionReference("siteBroker/session:exchange");

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
  const value = JSON.parse(input.trim());
  if (
    typeof value.email !== "string" ||
    typeof value.password !== "string" ||
    typeof value.siteAdminKeys?.live !== "string" ||
    typeof value.siteAdminKeys?.staging !== "string"
  ) {
    throw new Error("Electron client handoff credentials were not provided");
  }
  return value;
}

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };
}

async function getControlToken(siteOrigin, credentials) {
  const auth = createAuthClient({
    baseURL: siteOrigin,
    fetchOptions: {
      timeout: 15_000,
      headers: { origin: RENDERER_ORIGIN },
    },
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
  const response = await fetch(`${siteOrigin}/api/auth/convex/token`, {
    headers: {
      accept: "application/json",
      cookie,
      origin: RENDERER_ORIGIN,
    },
  });
  if (!response.ok) throw new Error("Control-plane acceptance token exchange failed");
  const body = await response.json();
  if (typeof body.token !== "string" || body.token.length < 100) {
    throw new Error("Control-plane acceptance token was invalid");
  }
  return body.token;
}

async function operatorClient(origin, siteOrigin, credentials) {
  const client = new ConvexHttpClient(origin);
  client.setAuth(await getControlToken(siteOrigin, credentials));
  return client;
}

async function targetEnvironments(client) {
  const websites = await client.query(listWebsites, {});
  const website = websites.find((candidate) => candidate.websiteKey === WEBSITE_KEY);
  if (!website) throw new Error("Transferred website is not registered");
  const environments = await client.query(listInstances, {
    websiteId: website.websiteId,
  });
  const targets = environments.filter((environment) =>
    [
      `${WEBSITE_KEY}:live`,
      `${WEBSITE_KEY}:staging`,
    ].includes(environment.instanceKey),
  );
  if (targets.length !== 2) {
    throw new Error("Transferred live and staging environments were not registered");
  }
  return targets;
}

function fixtureAdminKey(kind, credentials) {
  return credentials.siteAdminKeys[kind];
}

async function ensureConnections(client, label, credentials) {
  const targets = await targetEnvironments(client);
  const connected = [];
  for (const target of targets) {
    const kind = target.kind === "live" ? "live" : "staging";
    const adminKey = fixtureAdminKey(kind, credentials);
    const existing = await client.query(listConnections, {
      instanceId: target.instanceId,
    });
    let connection = existing.find(
      (candidate) => candidate.isActive && candidate.status === "connected",
    );
    if (!connection) {
      connection = await client.action(createConnection, {
        instanceId: target.instanceId,
        name: `${label} ${kind}`,
        accountLabel: "Client handoff Electron acceptance",
        deploymentAdminKey: adminKey,
      });
    }
    const exchange = await client.action(exchangeSiteSession, {
      connectionId: connection.connectionId,
      requestedCapabilities: ["health.read", "compatibility.read"],
      requestedSiteRole: "administrator",
    });
    if (
      exchange.instanceKey !== target.instanceKey ||
      typeof exchange.token !== "string" ||
      exchange.token.split(".").length !== 3
    ) {
      throw new Error(`The ${kind} receiving authority could not exchange a site session`);
    }
    connected.push({ target, connectionId: connection.connectionId, adminKey });
  }
  return connected;
}

async function revokeActiveConnections(client, credentials) {
  const targets = await targetEnvironments(client);
  const revoked = [];
  for (const target of targets) {
    const kind = target.kind === "live" ? "live" : "staging";
    const existing = await client.query(listConnections, {
      instanceId: target.instanceId,
    });
    const connection = existing.find(
      (candidate) => candidate.isActive && candidate.status === "connected",
    );
    if (!connection) throw new Error(`The agency ${kind} connection is missing`);
    await client.action(revokeConnection, { connectionId: connection.connectionId });
    revoked.push({ target, adminKey: fixtureAdminKey(kind, credentials), kind });
  }
  return revoked;
}

async function restoreAgencyConnections(client, revoked) {
  for (const entry of revoked) {
    const existing = await client.query(listConnections, {
      instanceId: entry.target.instanceId,
    });
    if (
      existing.some(
        (candidate) => candidate.isActive && candidate.status === "connected",
      )
    ) {
      continue;
    }
    await client.action(createConnection, {
      instanceId: entry.target.instanceId,
      name: `agency restored after client handoff ${entry.kind}`,
      accountLabel: "Local multi-site acceptance",
      deploymentAdminKey: entry.adminKey,
    });
  }
}

async function revokeReceivingConnections(client, connected) {
  for (const entry of connected) {
    const existing = await client.query(listConnections, {
      instanceId: entry.target.instanceId,
    });
    if (
      existing.some(
        (candidate) =>
          candidate.connectionId === entry.connectionId &&
          candidate.isActive &&
          candidate.status === "connected",
      )
    ) {
      await client.action(revokeConnection, { connectionId: entry.connectionId });
    }
  }
}

function dismissShutdownDialogs(page) {
  page.on("dialog", (dialog) => {
    void dialog.dismiss().catch(() => undefined);
  });
}

async function main() {
  const credentials = await readCredentials();
  await mkdir(artifactRoot, { recursive: true });
  const packageJson = (await readFile(handoffPackagePath, "utf8")).trim();
  const parsedPackage = JSON.parse(packageJson);
  if (
    parsedPackage.format !== "convexpress-handoff" ||
    parsedPackage.manifest?.website?.websiteKey !== WEBSITE_KEY
  ) {
    throw new Error("The exported Electron handoff package is unavailable");
  }

  const [playwrightEntry, electronExecutable] = await Promise.all([
    resolveBunPackage("playwright@", "node_modules/playwright/index.mjs"),
    resolveBunPackage(
      "electron@",
      "node_modules/electron/dist/Electron.app/Contents/MacOS/Electron",
    ),
  ]);
  const { _electron } = await import(pathToFileURL(playwrightEntry).href);

  const temporaryProfile = await mkdtemp(
    join(tmpdir(), "convexpress-client-handoff-electron-"),
  );
  const expectedUserData = join(temporaryProfile, "-dev");
  await mkdir(expectedUserData, { recursive: true });
  await writeFile(
    join(expectedUserData, "convexpress-config.json"),
    JSON.stringify({
      setupComplete: true,
      mode: "existing",
      convexUrl: B_ORIGIN,
      convexSiteUrl: B_SITE_ORIGIN,
    }),
    "utf8",
  );

  const launchEnvironment = buildElectronAcceptanceEnvironment(process.env, {
    CONVEXPRESS_DESKTOP_DEV: "1",
    CONVEXPRESS_DESKTOP_DEV_URL: RENDERER_ORIGIN,
  });

  let electronApp;
  let agencyClient;
  let receivingClient;
  let agencyRevoked = [];
  let receivingConnections = [];
  let tracingStarted = false;
  let phase = "launch-receiving-electron";
  const rendererErrors = [];
  let cleanupRestoredAgency = false;
  let cleanupRevokedReceiving = false;
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
    await page.waitForLoadState("domcontentloaded");
    const actualUserData = await electronApp.evaluate(({ app }) => app.getPath("userData"));
    if ((await realpath(actualUserData)) !== (await realpath(expectedUserData))) {
      throw new Error("Receiving Electron profile was not isolated");
    }
    const context = page.context();
    await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
    tracingStarted = true;

    phase = "authenticate-receiving-owner";
    await page.getByRole("textbox", { name: /email/i }).fill(credentials.email);
    await page.getByLabel(/password/i).fill(credentials.password);
    await page.getByRole("button", { name: /sign in|continue/i }).click();
    const organizationSelect = page.getByRole("combobox", { name: "Organization" });
    await organizationSelect.waitFor({ state: "visible", timeout: 20_000 });
    await organizationSelect.selectOption({ label: "Client Handoff Organization" });
    const businessSelect = page.getByRole("combobox", { name: "Business" });
    await businessSelect.selectOption({ label: "Client Owned Websites" });

    phase = "import-package-on-clean-controller-in-electron";
    await page.getByRole("button", { name: "Add or transfer site" }).click();
    const handoffPanel = page.getByRole("complementary", { name: "Website handoff" });
    await handoffPanel.waitFor({ state: "visible", timeout: 10_000 });
    await handoffPanel.getByLabel("Handoff JSON file").setInputFiles(handoffPackagePath);
    await handoffPanel
      .getByText(`Ready to verify ${WEBSITE_KEY} · 2 environments`, { exact: true })
      .waitFor({ state: "visible", timeout: 10_000 });
    await handoffPanel
      .getByRole("button", { name: "Verify and import registry" })
      .click();
    await handoffPanel
      .getByText(/Website registry imported|Website already matches this package/)
      .waitFor({ state: "visible", timeout: 30_000 });

    phase = "establish-receiving-authority";
    receivingClient = await operatorClient(B_ORIGIN, B_SITE_ORIGIN, credentials);
    receivingConnections = await ensureConnections(
      receivingClient,
      "receiving controller",
      credentials,
    );

    phase = "remove-agency-authority";
    agencyClient = await operatorClient(A_ORIGIN, A_SITE_ORIGIN, credentials);
    agencyRevoked = await revokeActiveConnections(agencyClient, credentials);

    phase = "render-live-site-from-receiving-controller";
    await handoffPanel
      .getByRole("button", { name: "Close website handoff" })
      .click();
    const websiteSelect = page.getByRole("combobox", { name: "Website" });
    await websiteSelect.selectOption({ label: "Northstar Shop" });
    const environmentSelect = page.getByRole("combobox", { name: "Environment" });
    await environmentSelect.selectOption({ label: "Live" });
    await page
      .getByText("Northstar Shop — Live", { exact: true })
      .first()
      .waitFor({ state: "visible", timeout: 30_000 });
    if (
      await page
        .getByText("This environment has no active management connection.", {
          exact: true,
        })
        .isVisible()
        .catch(() => false)
    ) {
      throw new Error("Receiving live environment rendered as disconnected");
    }
    await page.getByText("No recent activity.", { exact: true }).waitFor({
      state: "visible",
      timeout: 30_000,
    });
    await page.screenshot({
      path: join(artifactRoot, "electron-client-handoff-live.png"),
      type: "png",
    });

    phase = "render-staging-site-from-receiving-controller";
    await environmentSelect.selectOption({ label: "Staging" });
    await page
      .getByText("Northstar Shop — Staging", { exact: true })
      .first()
      .waitFor({ state: "visible", timeout: 30_000 });
    await page.getByText("No recent activity.", { exact: true }).waitFor({
      state: "visible",
      timeout: 30_000,
    });
    await page.screenshot({
      path: join(artifactRoot, "electron-client-handoff-staging.png"),
      type: "png",
    });

    phase = "verify-receiving-session-after-agency-removal";
    for (const connection of receivingConnections) {
      const exchange = await receivingClient.action(exchangeSiteSession, {
        connectionId: connection.connectionId,
        requestedCapabilities: ["health.read", "compatibility.read"],
        requestedSiteRole: "administrator",
      });
      if (exchange.instanceKey !== connection.target.instanceKey) {
        throw new Error("Receiving site session changed target after agency removal");
      }
    }

    await context.tracing.stop({
      path: join(artifactRoot, "client-handoff-electron-acceptance.zip"),
    });
    tracingStarted = false;
  } catch (error) {
    const page = electronApp?.windows()[0];
    const alerts = page
      ? await page.getByRole("alert").allTextContents().catch(() => [])
      : [];
    if (page) {
      await page
        .screenshot({
          path: join(artifactRoot, "electron-client-handoff-failure.png"),
          type: "png",
        })
        .catch(() => undefined);
    }
    throw new Error(
      JSON.stringify({
        message: error instanceof Error ? error.message : String(error),
        phase,
        alerts,
        rendererErrorCount: rendererErrors.length,
      }),
    );
  } finally {
    if (tracingStarted && electronApp) {
      const page = electronApp.windows()[0];
      await page?.context().tracing.stop({
        path: join(artifactRoot, "client-handoff-electron-acceptance-failed.zip"),
      }).catch(() => undefined);
    }
    await quitOwnedElectron(electronApp).catch(() => undefined);
    if (agencyClient && agencyRevoked.length > 0) {
      try {
        await restoreAgencyConnections(agencyClient, agencyRevoked);
        cleanupRestoredAgency = true;
      } catch {
        cleanupRestoredAgency = false;
      }
    }
    if (
      receivingClient &&
      receivingConnections.length > 0 &&
      (agencyRevoked.length === 0 || cleanupRestoredAgency)
    ) {
      try {
        await revokeReceivingConnections(receivingClient, receivingConnections);
        cleanupRevokedReceiving = true;
      } catch {
        cleanupRevokedReceiving = false;
      }
    }
    await rm(temporaryProfile, { recursive: true, force: true });
  }

  if (agencyRevoked.length > 0 && !cleanupRestoredAgency) {
    throw new Error("Agency authority could not be restored after client handoff acceptance");
  }
  if (receivingConnections.length > 0 && !cleanupRevokedReceiving) {
    throw new Error("Temporary receiving authority could not be revoked after acceptance");
  }
  process.stdout.write(
    `${JSON.stringify({
      acceptanceMode: "client-handoff",
      electronWindow: true,
      cleanReceivingDatabase: true,
      packageImportedInElectron: true,
      receivingAuthoritiesEstablished: receivingConnections.length,
      agencyAuthoritiesRevokedDuringProof: agencyRevoked.length,
      liveRenderedAfterAgencyRevocation: true,
      stagingRenderedAfterAgencyRevocation: true,
      receivingSessionsValidAfterAgencyRevocation: true,
      agencyAuthoritiesRestoredAfterProof: cleanupRestoredAgency,
      temporaryReceivingAuthoritiesRevoked: cleanupRevokedReceiving,
      rendererErrorCount: rendererErrors.length,
    })}\n`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
