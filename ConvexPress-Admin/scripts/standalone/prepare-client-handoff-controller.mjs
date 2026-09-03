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

const CONTROL_ORIGIN = "http://127.0.0.1:4920";
const CONTROL_SITE_ORIGIN = "http://127.0.0.1:4921";
const RENDERER_ORIGIN = "http://127.0.0.1:4105";
const controllerRoot = path.resolve("temp/client-handoff-controller");

const reserveBootstrap = makeFunctionReference("serverBootstrap:reserve");
const finalizeBootstrap = makeFunctionReference("serverBootstrap:finalize");
const seedRoles = makeFunctionReference("rbac/mutations:seedMvpRoles");
const listOrganizations = makeFunctionReference("organizations:list");
const createOrganization = makeFunctionReference("organizations:create");
const listBusinesses = makeFunctionReference("businesses:list");
const createBusiness = makeFunctionReference("businesses:create");

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
    typeof value.name !== "string"
  ) {
    throw new Error("Client controller owner credentials are required on stdin");
  }
  return {
    email: value.email.trim().toLowerCase(),
    password: value.password,
    name: value.name.trim(),
  };
}

function authClient() {
  return createAuthClient({
    baseURL: CONTROL_SITE_ORIGIN,
    fetchOptions: {
      timeout: 15_000,
      headers: { origin: RENDERER_ORIGIN },
    },
    plugins: [
      convexClient(),
      crossDomainClient({ storage: memoryStorage(), disableCache: true }),
    ],
  });
}

async function exchangeToken(auth) {
  const cookie = auth.getCookie();
  if (!cookie) throw new Error("Client controller did not issue an owner session");
  const response = await fetch(`${CONTROL_SITE_ORIGIN}/api/auth/convex/token`, {
    headers: {
      accept: "application/json",
      cookie,
      origin: RENDERER_ORIGIN,
    },
  });
  if (!response.ok) throw new Error("Client controller token exchange failed");
  const body = await response.json();
  if (typeof body.token !== "string" || body.token.length < 100) {
    throw new Error("Client controller token response was invalid");
  }
  return body.token;
}

const credentials = await readCredentials();
const localConfig = JSON.parse(
  await readFile(
    path.join(
      controllerRoot,
      "packages/control-plane/.convex/local/default/config.json",
    ),
    "utf8",
  ),
);
if (typeof localConfig.adminKey !== "string") {
  throw new Error("Client controller deployment admin key is unavailable");
}

const admin = new ConvexHttpClient(CONTROL_ORIGIN);
admin.setAdminAuth(localConfig.adminKey);
const auth = authClient();
let createdOwner = false;
process.stderr.write("client-handoff-controller: checking owner login\n");
let signIn = await auth.signIn.email({
  email: credentials.email,
  password: credentials.password,
});
if (signIn.error) {
  process.stderr.write("client-handoff-controller: reserving first owner\n");
  const reservationId = "reservation_client_handoff_acceptance";
  await admin.mutation(reserveBootstrap, {
    reservationId,
    machineId: "machine_client_handoff_acceptance",
    ownerEmail: credentials.email,
    ttlMs: 30 * 60_000,
  });
  process.stderr.write("client-handoff-controller: creating first owner\n");
  const signUp = await auth.signUp.email({
    email: credentials.email,
    password: credentials.password,
    name: credentials.name,
  });
  if (signUp.error) {
    throw new Error(`Client controller owner creation failed: ${signUp.error.code ?? "FAILED"}`);
  }
  process.stderr.write("client-handoff-controller: finalizing first owner\n");
  await admin.mutation(finalizeBootstrap, { reservationId });
  createdOwner = true;
}

process.stderr.write("client-handoff-controller: exchanging owner token\n");
const token = await exchangeToken(auth);
const control = new ConvexHttpClient(CONTROL_ORIGIN);
control.setAuth(token);
process.stderr.write("client-handoff-controller: seeding roles\n");
await control.mutation(seedRoles, {});

process.stderr.write("client-handoff-controller: creating destination hierarchy\n");
const organizations = await control.query(listOrganizations, {
  includeInactive: true,
});
let organization = organizations.find(
  (candidate) => candidate.slug === "client-handoff-acceptance",
);
if (!organization) {
  organization = await control.mutation(createOrganization, {
    name: "Client Handoff Organization",
    slug: "client-handoff-acceptance",
    description: "Isolated receiving controller used for Electron handoff acceptance.",
  });
}

const businesses = await control.query(listBusinesses, {
  organizationId: organization.organizationId,
  includeInactive: true,
});
let business = businesses.find(
  (candidate) => candidate.slug === "client-owned-websites",
);
if (!business) {
  business = await control.mutation(createBusiness, {
    organizationId: organization.organizationId,
    name: "Client Owned Websites",
    slug: "client-owned-websites",
    description: "Websites transferred from the agency controller.",
  });
}

process.stdout.write(
  `${JSON.stringify({
    status: "ready",
    createdOwner,
    organization: organization.name,
    business: business.name,
    databaseOrigin: CONTROL_ORIGIN,
    siteOrigin: CONTROL_SITE_ORIGIN,
    secretOutput: false,
  })}\n`,
);
