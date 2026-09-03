import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

const requireFromControlPlane = createRequire(
  new URL("../../packages/control-plane/package.json", import.meta.url),
);
const { convexClient, crossDomainClient } = requireFromControlPlane(
  "@convex-dev/better-auth/client/plugins",
);
const { createAuthClient } = requireFromControlPlane("better-auth/client");

const CONTROL_ORIGIN = "http://127.0.0.1:4720";
const CONTROL_SITE_ORIGIN = "http://127.0.0.1:4721";
const fixturesRoot = path.resolve("temp/site-fixtures");

const fixtures = [
  {
    key: "journal",
    directory: "journal-live",
    cloudPort: 4840,
    managementPort: 4841,
    websiteKey: "acceptance:northstar:journal",
    instanceKey: "acceptance:northstar:journal:live",
    instanceId: "kn73kcp7jfwtx4rf0qmwyy6y2h8dnjq1",
    siteOrigin: "https://journal.northstar.example",
  },
  {
    key: "summit",
    directory: "summit-live",
    cloudPort: 4850,
    managementPort: 4851,
    websiteKey: "acceptance:summit:main",
    instanceKey: "acceptance:summit:main:live",
    instanceId: "kn72q5dcwg84cp9px8941r3tcx8dmhr6",
    siteOrigin: "https://www.summit.example",
  },
];

const managementCapabilities = [
  "health.read",
  "compatibility.read",
  "site.register",
  "site.attach",
  "site.deploy",
  "site.select",
  "session.exchange",
  "backup.create",
  "site.clone",
  "site.promote",
  "site.restore",
  "credential.rotate",
  "authority.grant",
  "authority.revoke",
  "operation.resume",
  "handoff.export",
];

const configureIdentity = makeFunctionReference(
  "management/bootstrap:configureIdentity",
);
const seedRoles = makeFunctionReference("roles/internals:seedRoles");
const updateInstance = makeFunctionReference("websiteInstances:update");
const listConnections = makeFunctionReference(
  "connections/queries:listForInstance",
);
const createConnection = makeFunctionReference("connections/actions:create");

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

async function readCredentials() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (typeof value.email !== "string" || typeof value.password !== "string") {
    throw new Error("Outer operator credentials are required on stdin");
  }
  return value;
}

async function controlPlaneToken(credentials) {
  const auth = createAuthClient({
    baseURL: CONTROL_SITE_ORIGIN,
    fetchOptions: { timeout: 15_000 },
    plugins: [
      convexClient(),
      crossDomainClient({ storage: memoryStorage(), disableCache: true }),
    ],
  });
  const { error } = await auth.signIn.email({
    email: credentials.email.trim().toLowerCase(),
    password: credentials.password,
  });
  if (error) throw new Error("Outer operator authentication failed");

  const cookie = auth.getCookie();
  if (!cookie) throw new Error("Outer operator session cookie was not issued");
  const response = await fetch(`${CONTROL_SITE_ORIGIN}/api/auth/convex/token`, {
    headers: {
      accept: "application/json",
      cookie,
      origin: "http://127.0.0.1:4105",
    },
  });
  if (!response.ok) throw new Error("Outer operator token exchange failed");
  const body = await response.json();
  if (typeof body.token !== "string" || body.token.length < 100) {
    throw new Error("Outer operator token response was invalid");
  }
  return body.token;
}

async function siteFixture(definition) {
  const root = path.join(fixturesRoot, definition.directory);
  const config = JSON.parse(
    await readFile(path.join(root, ".convex/local/default/config.json"), "utf8"),
  );
  if (typeof config.adminKey !== "string") {
    throw new Error(`${definition.key} fixture has no deployment admin key`);
  }
  const client = new ConvexHttpClient(
    `http://127.0.0.1:${definition.cloudPort}`,
  );
  client.setAdminAuth(config.adminKey);
  return { ...definition, client, deploymentAdminKey: config.adminKey };
}

const credentials = await readCredentials();
const token = await controlPlaneToken(credentials);
const control = new ConvexHttpClient(CONTROL_ORIGIN);
control.setAuth(token);

const results = [];
for (const definition of fixtures) {
  const fixture = await siteFixture(definition);
  const deploymentOrigin = `http://127.0.0.1:${fixture.cloudPort}`;
  const managementOrigin = `http://127.0.0.1:${fixture.managementPort}`;

  await fixture.client.mutation(configureIdentity, {
    websiteKey: fixture.websiteKey,
    instanceKey: fixture.instanceKey,
    environmentKind: "live",
    deploymentOrigin,
    managementOrigin,
    siteOrigin: fixture.siteOrigin,
    siteContractVersion: "1.0.0",
    schemaVersion: "2026.9.0",
    engineVersion: "1.0.0",
    managementCapabilities,
  });
  await fixture.client.mutation(seedRoles, {});

  await control.mutation(updateInstance, {
    instanceId: fixture.instanceId,
    deploymentOrigin,
    managementOrigin,
    siteOrigin: fixture.siteOrigin,
    siteContractVersion: "1.0.0",
    schemaVersion: "2026.9.0",
    engineVersion: "1.0.0",
  });

  const existing = await control.query(listConnections, {
    instanceId: fixture.instanceId,
  });
  let connection = existing.find(
    (entry) => entry.isActive && entry.status === "connected",
  );
  if (!connection) {
    connection = await control.action(createConnection, {
      instanceId: fixture.instanceId,
      name: `${fixture.key} local acceptance`,
      accountLabel: "Local multi-site acceptance",
      deploymentAdminKey: fixture.deploymentAdminKey,
    });
  }

  const health = await fetch(
    `${managementOrigin}/api/convexpress/management/health`,
  );
  const healthBody = await health.json();
  if (
    !health.ok ||
    healthBody.websiteKey !== fixture.websiteKey ||
    healthBody.instanceKey !== fixture.instanceKey
  ) {
    throw new Error(`${fixture.key} health identity did not match its registry`);
  }
  results.push({
    key: fixture.key,
    websiteKey: fixture.websiteKey,
    instanceKey: fixture.instanceKey,
    databaseOrigin: deploymentOrigin,
    managementOrigin,
    connected: true,
    healthy: true,
  });
}

console.log(
  JSON.stringify({
    status: "passed",
    fixtureCount: results.length,
    fixtures: results,
    secretsPrinted: false,
  }),
);
