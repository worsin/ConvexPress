"use node";

import { randomBytes } from "node:crypto";

import {
  createUnsignedManagementEnvelope,
  CURRENT_SITE_CONTRACT_VERSION,
  OPERATION_CODES,
  siteSessionExchangeResponseSchema,
  type ManagementCapabilityCode,
  type SiteSessionRoleSlug,
} from "@convexpress/site-contract";
import { signManagementEnvelope } from "@convexpress/site-contract/node";
import { v } from "convex/values";

import type { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { action } from "../_generated/server";
import { parseControllerCredential } from "../connections/controllerCredentials";
import {
  decryptCredentialPayload,
  parseEnvelopeKey,
  type CredentialEnvelope,
} from "../connections/crypto";

interface SessionTarget {
  connectionId: Id<"overseer_connections">;
  websiteKey: string;
  instanceKey: string;
  deploymentOrigin: string;
  managementOrigin: string;
  siteOrigin: string;
  kind: string;
  requestedCapabilities: ManagementCapabilityCode[];
  requestedSiteRole: SiteSessionRoleSlug;
  credentials: CredentialEnvelope;
}

function aad(target: SessionTarget) {
  return `${target.websiteKey}|${target.instanceKey}|${String(target.connectionId)}`;
}

export const exchange = action({
  args: {
    connectionId: v.id("overseer_connections"),
    requestedCapabilities: v.array(v.string()),
    requestedSiteRole: v.union(
      v.literal("administrator"),
      v.literal("editor"),
      v.literal("author"),
      v.literal("contributor"),
      v.literal("subscriber"),
    ),
  },
  returns: v.object({
    token: v.string(),
    websiteKey: v.string(),
    instanceKey: v.string(),
    siteOrigin: v.string(),
    capabilities: v.array(v.string()),
    siteRole: v.string(),
    siteCapabilities: v.array(v.string()),
    expiresAt: v.number(),
  }),
  handler: async (ctx, args) => {
    try {
      const target = (await ctx.runQuery(
        internal.siteBroker.internal.prepareSession,
        args,
      )) as SessionTarget;
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
      if (
        target.requestedCapabilities.some(
          (capability) => !credential.capabilities.includes(capability),
        )
      ) {
        throw new Error("credential grant mismatch");
      }
      const nonceSuffix = randomBytes(18).toString("hex");
      const body = {
        requestedCapabilities: target.requestedCapabilities,
        requestedSiteRole: target.requestedSiteRole,
      };
      const now = Date.now();
      const envelope = signManagementEnvelope(
        createUnsignedManagementEnvelope({
          contractVersion: CURRENT_SITE_CONTRACT_VERSION,
          controllerId: credential.controllerId,
          keyId: credential.keyId,
          websiteKey: target.websiteKey,
          instanceKey: target.instanceKey,
          operationCode: OPERATION_CODES.sessionExchange,
          body,
          nonce: `nonce_${nonceSuffix}`,
          issuedAt: new Date(now - 500).toISOString(),
          expiresAt: new Date(now + 15 * 60_000).toISOString(),
          idempotencyKey: `exchange_${nonceSuffix}`,
        }),
        credential.privateKeyPem,
      );
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8_000);
      let response: Response;
      try {
        response = await fetch(
          `${target.managementOrigin}/api/convexpress/management/session/exchange`,
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
      } finally {
        clearTimeout(timeout);
      }
      if (!response.ok) throw new Error("site rejected session");
      const declaredLength = Number(response.headers.get("content-length") ?? "0");
      if (Number.isFinite(declaredLength) && declaredLength > 65_536) {
        throw new Error("site response oversized");
      }
      const session = siteSessionExchangeResponseSchema.parse(
        await response.json(),
      );
      if (
        session.controllerId !== credential.controllerId ||
        session.capabilities.some(
          (capability) => !target.requestedCapabilities.includes(capability),
        )
      ) {
        throw new Error("site session audience mismatch");
      }
      return {
        token: session.token,
        websiteKey: target.websiteKey,
        instanceKey: target.instanceKey,
        siteOrigin: target.siteOrigin,
        capabilities: session.capabilities,
        siteRole: session.siteRole,
        siteCapabilities: session.siteCapabilities,
        expiresAt: session.expiresAt,
      };
    } catch {
      throw new Error("Site session could not be established");
    }
  },
});
