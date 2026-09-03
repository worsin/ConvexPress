import { readFile } from "node:fs/promises";
import path from "node:path";

import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

import {
  createUnsignedManagementEnvelope,
  OPERATION_CODES,
} from "../../packages/site-contract/src/index.ts";
import {
  generateManagementKeyPair,
  signManagementEnvelope,
} from "../../packages/site-contract/src/node.ts";

const fixturesRoot = path.resolve("temp/site-fixtures");
const proofSuffix = Date.now().toString(36);
const capabilities = [
  "health.read",
  "compatibility.read",
  "site.select",
  "session.exchange",
  "backup.create",
];

const enrollAuthority = makeFunctionReference(
  "management/bootstrap:enrollAuthority",
);
const revokeAuthority = makeFunctionReference(
  "management/bootstrap:revokeAuthority",
);

async function readFixture(kind, expectedCloudPort, expectedSitePort) {
  const root = path.join(fixturesRoot, kind);
  const config = JSON.parse(
    await readFile(path.join(root, ".convex/local/default/config.json"), "utf8"),
  );
  if (
    config.ports?.cloud !== expectedCloudPort ||
    config.ports?.site !== expectedSitePort ||
    typeof config.adminKey !== "string"
  ) {
    throw new Error(`${kind} fixture is not the expected isolated deployment`);
  }
  const client = new ConvexHttpClient(`http://127.0.0.1:${expectedCloudPort}`);
  client.setAdminAuth(config.adminKey);
  const healthResponse = await fetch(
    `http://127.0.0.1:${expectedSitePort}/api/convexpress/management/health`,
  );
  if (!healthResponse.ok) throw new Error(`${kind} health endpoint is unavailable`);
  const health = await healthResponse.json();
  return {
    kind,
    client,
    siteUrl: `http://127.0.0.1:${expectedSitePort}`,
    websiteKey: health.websiteKey,
    instanceKey: health.instanceKey,
  };
}

function signedExchange(fixture, controller, nonce) {
  const body = {
    requestedCapabilities: ["health.read"],
    requestedSiteRole: "subscriber",
  };
  return {
    body,
    envelope: signManagementEnvelope(
      createUnsignedManagementEnvelope({
        contractVersion: "1.0.0",
        controllerId: controller.controllerId,
        keyId: controller.keyId,
        websiteKey: fixture.websiteKey,
        instanceKey: fixture.instanceKey,
        operationCode: OPERATION_CODES.sessionExchange,
        body,
        nonce,
        issuedAt: new Date(Date.now() - 1_000).toISOString(),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        idempotencyKey: `exchange-${nonce}`,
      }),
      controller.privateKeyPem,
    ),
  };
}

async function exchange(fixture, controller, nonce, expectedStatus = 200) {
  const response = await fetch(
    `${fixture.siteUrl}/api/convexpress/management/session/exchange`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(signedExchange(fixture, controller, nonce)),
    },
  );
  if (response.status !== expectedStatus) {
    throw new Error(
      `${fixture.kind} ${controller.controllerId} exchange returned ${response.status}`,
    );
  }
  const result = await response.json();
  if (expectedStatus === 200) {
    if (
      typeof result.token !== "string" ||
      !result.token.startsWith("cpms_") ||
      result.controllerId !== controller.controllerId
    ) {
      throw new Error(`${fixture.kind} returned an invalid site session`);
    }
  }
}

const standaloneKeys = generateManagementKeyPair();
const voKeys = generateManagementKeyPair();
const standalone = {
  controllerId: `controller_standalone_proof_${proofSuffix}`,
  keyId: `key_standalone_proof_${proofSuffix}`,
  ...standaloneKeys,
};
const vo = {
  controllerId: `controller_vo_proof_${proofSuffix}`,
  keyId: `key_vo_proof_${proofSuffix}`,
  ...voKeys,
};
const fixtures = await Promise.all([
  readFixture("live", 4820, 4821),
  readFixture("staging", 4830, 4831),
]);

for (const fixture of fixtures) {
  for (const controller of [standalone, vo]) {
    await fixture.client.mutation(enrollAuthority, {
      controllerId: controller.controllerId,
      keyId: controller.keyId,
      label:
        controller === standalone
          ? "Standalone ConvexPress acceptance controller"
          : "Virtual Overseer acceptance controller",
      publicKeyPem: controller.publicKeyPem,
      capabilities,
    });
  }
  await exchange(
    fixture,
    standalone,
    `nonce_${fixture.kind}_standalone_${proofSuffix}`,
  );
  await exchange(fixture, vo, `nonce_${fixture.kind}_vo_${proofSuffix}`);
}

const live = fixtures.find((fixture) => fixture.kind === "live");
if (!live) throw new Error("Live fixture is missing");
await live.client.mutation(revokeAuthority, {
  controllerId: standalone.controllerId,
  keyId: standalone.keyId,
});
await exchange(
  live,
  standalone,
  `nonce_live_standalone_revoked_${proofSuffix}`,
  401,
);
await exchange(live, vo, `nonce_live_vo_after_revoke_${proofSuffix}`);

console.log(
  JSON.stringify({
    status: "passed",
    deployments: fixtures.map((fixture) => ({
      kind: fixture.kind,
      websiteKey: fixture.websiteKey,
      instanceKey: fixture.instanceKey,
      authoritiesEnrolled: 2,
    })),
    oneControllerRevocation: "standalone-denied-vo-allowed",
    privateKeysPersisted: false,
  }),
);
