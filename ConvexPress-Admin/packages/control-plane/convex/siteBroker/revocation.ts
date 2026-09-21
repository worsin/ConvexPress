"use node";

import { randomBytes } from "node:crypto";

import {
  createUnsignedManagementEnvelope,
  CURRENT_SITE_CONTRACT_VERSION,
  OPERATION_CODES,
} from "@convexpress/site-contract";
import { signManagementEnvelope } from "@convexpress/site-contract/node";
import { v } from "convex/values";

import type { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { parseControllerCredential } from "../connections/controllerCredentials";
import {
  decryptCredentialPayload,
  parseEnvelopeKey,
  type CredentialEnvelope,
} from "../connections/crypto";

type RevocationScope =
  | { scope: "operator"; controllerSubjectId: string }
  | { scope: "controller" };

interface RevocationTarget {
  connectionId: Id<"overseer_connections">;
  websiteKey: string;
  instanceKey: string;
  managementOrigin: string;
  credentials: CredentialEnvelope;
}

function aad(target: RevocationTarget) {
  return `${target.websiteKey}|${target.instanceKey}|${String(target.connectionId)}`;
}

async function revokeTarget(target: RevocationTarget, body: RevocationScope) {
  const key = parseEnvelopeKey(
    process.env.CONVEXPRESS_CONNECTION_ENVELOPE_KEYS,
    target.credentials.version,
  );
  const credential = parseControllerCredential(
    decryptCredentialPayload({
      envelope: target.credentials,
      key,
      aad: aad(target),
    }),
  );
  if (!credential.capabilities.includes("session.exchange")) {
    throw new Error("Controller cannot revoke sessions");
  }
  const suffix = randomBytes(18).toString("hex");
  const now = Date.now();
  const envelope = signManagementEnvelope(
    createUnsignedManagementEnvelope({
      contractVersion: CURRENT_SITE_CONTRACT_VERSION,
      controllerId: credential.controllerId,
      keyId: credential.keyId,
      websiteKey: target.websiteKey,
      instanceKey: target.instanceKey,
      operationCode: OPERATION_CODES.sessionRevoke,
      body,
      nonce: `revoke_${suffix}`,
      issuedAt: new Date(now - 500).toISOString(),
      expiresAt: new Date(now + 30_000).toISOString(),
      idempotencyKey: `revoke_${suffix}`,
    }),
    credential.privateKeyPem,
  );
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(
      `${target.managementOrigin}/api/convexpress/management/session/revoke`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ envelope, body }),
        signal: controller.signal,
      },
    );
    if (!response.ok) throw new Error("Site rejected session revocation");
  } finally {
    clearTimeout(timeout);
  }
}

export const propagate = internalAction({
  args: {
    scope: v.union(v.literal("operator"), v.literal("controller")),
    controllerSubjectId: v.optional(v.string()),
    targetOrganizationId: v.optional(v.id("overseer_organizations")),
    targetBusinessId: v.optional(v.id("overseer_businesses")),
    targetWebsiteId: v.optional(v.id("overseer_websites")),
    attempt: v.optional(v.number()),
  },
  returns: v.object({
    targets: v.number(),
    delivered: v.number(),
    failed: v.number(),
    retryScheduled: v.boolean(),
  }),
  handler: async (ctx, args) => {
    if (
      (args.scope === "operator" && !args.controllerSubjectId) ||
      (args.scope === "controller" && args.controllerSubjectId !== undefined)
    ) {
      throw new Error("Invalid management session revocation scope");
    }
    const attempt = args.attempt ?? 0;
    if (!Number.isSafeInteger(attempt) || attempt < 0 || attempt > 3) {
      throw new Error("Invalid management session revocation attempt");
    }
    const body: RevocationScope =
      args.scope === "operator"
        ? {
            scope: "operator",
            controllerSubjectId: args.controllerSubjectId!,
          }
        : { scope: "controller" };
    const targets = (await ctx.runQuery(
      (internal as any).siteBroker.revocationInternal.listTargets,
      { organizationId: args.targetOrganizationId, businessId: args.targetBusinessId, websiteId: args.targetWebsiteId },
    )) as RevocationTarget[];
    const results = await Promise.allSettled(
      targets.map((target) => revokeTarget(target, body)),
    );
    const failed = results.filter((result) => result.status === "rejected").length;
    const retryScheduled = failed > 0 && attempt < 3;
    if (retryScheduled) {
      await ctx.scheduler.runAfter(
        2 ** attempt * 1_000,
        (internal as any).siteBroker.revocation.propagate,
        {
          scope: args.scope,
          controllerSubjectId: args.controllerSubjectId,
          targetOrganizationId: args.targetOrganizationId,
          targetBusinessId: args.targetBusinessId,
          targetWebsiteId: args.targetWebsiteId,
          attempt: attempt + 1,
        },
      );
    }
    return {
      targets: targets.length,
      delivered: targets.length - failed,
      failed,
      retryScheduled,
    };
  },
});
