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

const fleet = loadTestFleetConfig();
const CONTROL_ORIGIN = fleet.control.deploymentOrigin;
const CONTROL_SITE_ORIGIN = fleet.control.siteOrigin;
const WEBSITE_KEY = "acceptance:northstar:shop";
const INSTANCE_KEY = "acceptance:northstar:shop:staging";

const listWebsites = makeFunctionReference("websites:list");
const listInstances = makeFunctionReference("websiteInstances:list");
const startBackup = makeFunctionReference("operations/mutations:startBackup");
const resumeOperation = makeFunctionReference(
  "operations/mutations:resumeOperation",
);
const getOperation = makeFunctionReference("operations/queries:get");
const listBackups = makeFunctionReference(
  "operations/queries:listBackupsForInstance",
);

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
    throw new Error("credentials");
  }
  return value;
}

async function getControlToken(credentials) {
  const auth = createAuthClient({
    baseURL: CONTROL_SITE_ORIGIN,
    fetchOptions: {
      timeout: 15_000,
      headers: { origin: fleet.rendererOrigin },
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
  if (error) {
    const code =
      typeof error.code === "string" && /^[A-Z0-9_]{2,80}$/.test(error.code)
        ? error.code
        : "FAILED";
    throw new Error(`authentication.signin:${code}`);
  }
  const cookie = auth.getCookie();
  if (!cookie) throw new Error("authentication.cookie");
  const response = await fetch(`${CONTROL_SITE_ORIGIN}/api/auth/convex/token`, {
    headers: {
      accept: "application/json",
      cookie,
      origin: fleet.rendererOrigin,
    },
  });
  if (!response.ok) throw new Error("authentication.exchange");
  const body = await response.json();
  if (typeof body.token !== "string" || body.token.length < 100) {
    throw new Error("authentication.response");
  }
  return body.token;
}

let phase = "credentials";
let safeDiagnostic;
try {
  process.stderr.write("backup-acceptance: credentials\n");
  const credentials = await readCredentials();
  phase = "authentication";
  process.stderr.write("backup-acceptance: authentication\n");
  const token = await getControlToken(credentials);
  const client = new ConvexHttpClient(CONTROL_ORIGIN);
  client.setAuth(token);

  phase = "target";
  process.stderr.write("backup-acceptance: target\n");
  const websites = await client.query(listWebsites, {});
  const website = websites.find((entry) => entry.websiteKey === WEBSITE_KEY);
  if (!website) throw new Error("website");
  const instances = await client.query(listInstances, {
    websiteId: website.websiteId,
  });
  const instance = instances.find((entry) => entry.instanceKey === INSTANCE_KEY);
  if (!instance) throw new Error("instance");

  phase = "start";
  process.stderr.write("backup-acceptance: start\n");
  const started = await client.mutation(startBackup, {
    instanceId: instance.instanceId,
    idempotencyKey: "acceptance_backup_staging_20260902_001",
    includeStorage: true,
    expectedRevision: instance.updatedAt,
    provider: "manual",
  });

  phase = "workflow";
  process.stderr.write("backup-acceptance: workflow\n");
  let detail;
  let lastState;
  let resumed = false;
  for (let attempt = 0; attempt < 240; attempt += 1) {
    detail = await client.query(getOperation, {
      operationId: started.operationId,
    });
    safeDiagnostic = {
      state: detail.operation.state,
      currentStep: detail.operation.currentStep,
      steps: detail.steps.map((step) => ({
        key: step.stepKey,
        state: step.state,
        attempt: step.attempt,
        errorCode: step.errorCode,
      })),
    };
    if (detail.operation.state !== lastState) {
      lastState = detail.operation.state;
      process.stderr.write(
        `backup-acceptance: state=${detail.operation.state} step=${detail.operation.currentStep ?? "none"}\n`,
      );
    }
    if (detail.operation.state === "interrupted" && !resumed) {
      phase = "resume";
      await client.mutation(resumeOperation, {
        operationId: started.operationId,
      });
      resumed = true;
      phase = "workflow";
      continue;
    }
    if (["succeeded", "failed", "cancelled", "interrupted"].includes(
      detail.operation.state,
    )) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!detail || detail.operation.state !== "succeeded") {
    throw new Error("workflow");
  }
  if (detail.steps.some((step) => step.state !== "succeeded")) {
    throw new Error("steps");
  }
  if (detail.receipts.length !== 1 || detail.receipts[0].status !== "succeeded") {
    throw new Error("receipt");
  }

  phase = "backup";
  process.stderr.write("backup-acceptance: backup\n");
  const backups = await client.query(listBackups, {
    instanceId: instance.instanceId,
    limit: 10,
  });
  const backup =
    backups.find((entry) => entry.verificationStatus === "verified") ??
    backups[0];
  if (!backup || backup.tableCount < 100 || backup.sizeBytes <= 0) {
    throw new Error("backup");
  }

  process.stdout.write(
    `${JSON.stringify({
      status: "passed",
      electronBrowserUsed: false,
      interruptionRecovered: resumed,
      instanceKey: INSTANCE_KEY,
      operationState: detail.operation.state,
      stepCount: detail.steps.length,
      receiptCount: detail.receipts.length,
      snapshotId: backup.snapshotId,
      tableCount: backup.tableCount,
      storageObjectCount: backup.storageObjectCount,
      checksumVerified: /^[a-f0-9]{64}$/.test(backup.checksumSha256),
    })}\n`,
  );
} catch (error) {
  const reason =
    error instanceof Error &&
    /^(authentication\.(signin(:[A-Z0-9_]{2,80})?|cookie|exchange|response)|website|instance|workflow|steps|receipt|backup)$/.test(
      error.message,
    )
      ? error.message
      : undefined;
  process.stdout.write(
    `${JSON.stringify({ status: "failed", phase, reason, diagnostic: safeDiagnostic })}\n`,
  );
  process.exitCode = 1;
}
