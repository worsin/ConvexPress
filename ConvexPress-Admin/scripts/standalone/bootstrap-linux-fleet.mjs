import { createRequire } from "node:module";

import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

import { loadTestFleetConfig } from "../../packages/desktop/scripts/lib/test-fleet-config.mjs";

const requireFromControlPlane = createRequire(
  new URL("../../packages/control-plane/package.json", import.meta.url),
);
const { convexClient, crossDomainClient } = requireFromControlPlane(
  "@convex-dev/better-auth/client/plugins",
);
const { createAuthClient } = requireFromControlPlane("better-auth/client");

const reserveBootstrap = makeFunctionReference("serverBootstrap:reserve");
const finalizeBootstrap = makeFunctionReference("serverBootstrap:finalize");
const seedOuterRoles = makeFunctionReference("rbac/mutations:seedMvpRoles");
const listOrganizations = makeFunctionReference("organizations:list");
const createOrganization = makeFunctionReference("organizations:create");
const listBusinesses = makeFunctionReference("businesses:list");
const createBusiness = makeFunctionReference("businesses:create");
const listWebsites = makeFunctionReference("websites:list");
const createWebsite = makeFunctionReference("websites:create");
const listInstances = makeFunctionReference("websiteInstances:list");
const attachInstance = makeFunctionReference("websiteInstances:attach");
const updateInstance = makeFunctionReference("websiteInstances:update");
const listConnections = makeFunctionReference(
  "connections/queries:listForInstance",
);
const createConnection = makeFunctionReference("connections/actions:create");
const configureIdentity = makeFunctionReference(
  "management/bootstrap:configureIdentity",
);
const seedSiteRoles = makeFunctionReference("roles/internals:seedRoles");

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
  let input = "";
  for await (const chunk of process.stdin) {
    input += chunk.toString("utf8");
    if (input.includes("\n")) break;
  }
  const value = JSON.parse(input.trim());
  if (
    typeof value.email !== "string" ||
    typeof value.password !== "string" ||
    typeof value.name !== "string" ||
    typeof value.controlAdminKey !== "string" ||
    typeof value.bootstrapClaimSecret !== "string" ||
    typeof value.siteAdminKeys?.alpha !== "string" ||
    typeof value.siteAdminKeys?.beta !== "string" ||
    typeof value.siteAdminKeys?.gamma !== "string"
  ) {
    throw new Error("Complete Linux fleet bootstrap credentials are required on stdin");
  }
  return {
    ...value,
    email: value.email.trim().toLowerCase(),
    name: value.name.trim(),
  };
}

function createOuterAuth(fleet) {
  return createAuthClient({
    baseURL: fleet.control.siteOrigin,
    fetchOptions: {
      timeout: 15_000,
      headers: { origin: fleet.rendererOrigin },
    },
    plugins: [
      convexClient(),
      crossDomainClient({ storage: memoryStorage(), disableCache: true }),
    ],
  });
}

async function exchangeOuterToken(auth, fleet) {
  const cookie = auth.getCookie();
  if (!cookie) throw new Error("Outer owner session cookie was not issued");
  const response = await fetch(
    `${fleet.control.siteOrigin}/api/auth/convex/token`,
    {
      headers: {
        accept: "application/json",
        cookie,
        origin: fleet.rendererOrigin,
      },
    },
  );
  if (!response.ok) throw new Error("Outer owner token exchange failed");
  const body = await response.json();
  if (typeof body.token !== "string" || body.token.length < 100) {
    throw new Error("Outer owner token response was invalid");
  }
  return body.token;
}

async function ensureOwner(credentials, fleet) {
  const admin = new ConvexHttpClient(fleet.control.deploymentOrigin);
  admin.setAdminAuth(credentials.controlAdminKey);
  const auth = createOuterAuth(fleet);
  let signIn = await auth.signIn.email({
    email: credentials.email,
    password: credentials.password,
  });
  let created = false;
  if (signIn.error) {
    await admin.mutation(reserveBootstrap, {
      reservationId: credentials.bootstrapClaimSecret,
      machineId: "linux_worker_convexpress_acceptance",
      ownerEmail: credentials.email,
      ttlMs: 30 * 60_000,
    });
    const signUp = await auth.signUp.email(
      {
        email: credentials.email,
        password: credentials.password,
        name: credentials.name,
      },
      {
        headers: {
          "x-convexpress-claim-secret": credentials.bootstrapClaimSecret,
        },
      },
    );
    if (signUp.error) {
      throw new Error(
        `Outer owner creation failed: ${signUp.error.code ?? "FAILED"}`,
      );
    }
    signIn = await auth.signIn.email({
      email: credentials.email,
      password: credentials.password,
    });
    if (signIn.error) throw new Error("New outer owner could not sign in");
    await admin.mutation(finalizeBootstrap, {
      reservationId: credentials.bootstrapClaimSecret,
    });
    created = true;
  }
  return { token: await exchangeOuterToken(auth, fleet), created };
}

async function ensureOrganization(control) {
  const organizations = await control.query(listOrganizations, {
    includeInactive: true,
  });
  return (
    organizations.find((entry) => entry.slug === "acceptance-agency-group") ??
    (await control.mutation(createOrganization, {
      name: "Acceptance Agency Group",
      slug: "acceptance-agency-group",
      description: "Linux Worker acceptance portfolio for standalone ConvexPress.",
    }))
  );
}

async function ensureBusiness(control, organization) {
  const businesses = await control.query(listBusinesses, {
    organizationId: organization.organizationId,
    includeInactive: true,
  });
  return (
    businesses.find((entry) => entry.slug === "northstar-commerce") ??
    (await control.mutation(createBusiness, {
      organizationId: organization.organizationId,
      name: "Northstar Commerce",
      slug: "northstar-commerce",
      description: "Multiple isolated ConvexPress sites managed from one controller.",
    }))
  );
}

async function ensureWebsite(control, organization, business, definition) {
  const websites = await control.query(listWebsites, {
    businessId: business.businessId,
    includeArchived: true,
  });
  return (
    websites.find((entry) => entry.websiteKey === definition.websiteKey) ??
    (await control.mutation(createWebsite, {
      organizationId: organization.organizationId,
      businessId: business.businessId,
      websiteKey: definition.websiteKey,
      title: definition.websiteTitle,
      description: definition.description,
      primaryDomain: definition.primaryDomain,
      makeDefault: definition.makeDefault,
    }))
  );
}

async function ensureInstance(control, website, definition, endpoint) {
  const instances = await control.query(listInstances, {
    websiteId: website.websiteId,
    includeArchived: true,
  });
  const expected = {
    deploymentOrigin: endpoint.deploymentOrigin,
    managementOrigin: endpoint.siteOrigin,
    siteOrigin: definition.publicSiteOrigin,
    siteContractVersion: "1.0.0",
    schemaVersion: "2026.9.0",
    engineVersion: "1.0.0",
  };
  const current = instances.find(
    (entry) => entry.instanceKey === definition.instanceKey,
  );
  if (current) {
    return await control.mutation(updateInstance, {
      instanceId: current.instanceId,
      label: definition.label,
      ...expected,
    });
  }
  return await control.mutation(attachInstance, {
    websiteId: website.websiteId,
    instanceKey: definition.instanceKey,
    kind: definition.kind,
    label: definition.label,
    ...expected,
    makeDefault: definition.kind === "live",
  });
}

async function configureSite(definition, endpoint, adminKey) {
  const client = new ConvexHttpClient(endpoint.deploymentOrigin);
  client.setAdminAuth(adminKey);
  await client.mutation(configureIdentity, {
    websiteKey: definition.websiteKey,
    instanceKey: definition.instanceKey,
    environmentKind: definition.kind,
    deploymentOrigin: endpoint.deploymentOrigin,
    managementOrigin: endpoint.siteOrigin,
    siteOrigin: definition.publicSiteOrigin,
    siteContractVersion: "1.0.0",
    schemaVersion: "2026.9.0",
    engineVersion: "1.0.0",
    managementCapabilities,
  });
  await client.mutation(seedSiteRoles, {});
  const response = await fetch(
    `${endpoint.siteOrigin}/api/convexpress/management/health`,
  );
  const health = await response.json();
  if (
    !response.ok ||
    health.websiteKey !== definition.websiteKey ||
    health.instanceKey !== definition.instanceKey
  ) {
    throw new Error(`${definition.key} site identity health check failed`);
  }
}

async function ensureConnection(control, instance, definition, adminKey) {
  const connections = await control.query(listConnections, {
    instanceId: instance.instanceId,
  });
  const active = connections.find(
    (entry) => entry.isActive && entry.status === "connected",
  );
  if (active) return active.connectionId;
  const created = await control.action(createConnection, {
    instanceId: instance.instanceId,
    name: `${definition.websiteTitle} ${definition.label}`,
    accountLabel: "Linux Worker acceptance fleet",
    deploymentAdminKey: adminKey,
  });
  return created.connectionId;
}

const fleet = loadTestFleetConfig();
const credentials = await readCredentials();
const owner = await ensureOwner(credentials, fleet);
const control = new ConvexHttpClient(fleet.control.deploymentOrigin);
control.setAuth(owner.token);
await control.mutation(seedOuterRoles, {});

const organization = await ensureOrganization(control);
const business = await ensureBusiness(control, organization);
const definitions = [
  {
    key: "alpha",
    websiteKey: "acceptance:northstar:shop",
    websiteTitle: "Northstar Shop",
    description: "Primary commerce website.",
    primaryDomain: "shop.northstar.example",
    makeDefault: true,
    instanceKey: "acceptance:northstar:shop:live",
    kind: "live",
    label: "Live",
    publicSiteOrigin: "https://shop.northstar.example",
  },
  {
    key: "beta",
    websiteKey: "acceptance:northstar:shop",
    websiteTitle: "Northstar Shop",
    description: "Primary commerce website.",
    primaryDomain: "shop.northstar.example",
    makeDefault: true,
    instanceKey: "acceptance:northstar:shop:staging",
    kind: "staging",
    label: "Staging",
    publicSiteOrigin: "https://staging-shop.northstar.example",
  },
  {
    key: "gamma",
    websiteKey: "acceptance:northstar:journal",
    websiteTitle: "Northstar Journal",
    description: "Second isolated publication website.",
    primaryDomain: "journal.northstar.example",
    makeDefault: false,
    instanceKey: "acceptance:northstar:journal:live",
    kind: "live",
    label: "Live",
    publicSiteOrigin: "https://journal.northstar.example",
  },
];

const results = [];
for (const [index, definition] of definitions.entries()) {
  const endpoint = fleet.sites[index];
  const adminKey = credentials.siteAdminKeys[definition.key];
  const website = await ensureWebsite(
    control,
    organization,
    business,
    definition,
  );
  await configureSite(definition, endpoint, adminKey);
  const instance = await ensureInstance(control, website, definition, endpoint);
  await ensureConnection(control, instance, definition, adminKey);
  results.push({
    websiteKey: definition.websiteKey,
    instanceKey: definition.instanceKey,
    kind: definition.kind,
    deploymentOrigin: endpoint.deploymentOrigin,
    managementOrigin: endpoint.siteOrigin,
    connected: true,
    healthy: true,
  });
}

process.stdout.write(
  `${JSON.stringify({
    status: "ready",
    ownerCreated: owner.created,
    organization: organization.name,
    business: business.name,
    siteDatabaseCount: results.length,
    sites: results,
    secretOutput: false,
  })}\n`,
);
