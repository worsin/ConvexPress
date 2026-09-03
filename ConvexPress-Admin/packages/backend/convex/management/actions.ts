"use node";

import { createHash, randomBytes } from "node:crypto";

import type {
  RuntimeManagementCapabilityCode,
  RuntimeSignedManagementEnvelope,
  RuntimeSiteIdentity,
  RuntimeSiteSessionRoleSlug,
} from "@convexpress/site-contract/runtime-protocol";
import { type GenericId, v } from "convex/values";
import { anyApi, internalActionGeneric as internalAction } from "convex/server";

import {
  verifyStoredManagementEnvelope,
  type StoredManagementAuthority,
} from "./authority";
import { decideSessionGrant, getSessionExpiration } from "./sessionPolicy";
import {
  managementEnvelopeValidator,
} from "./validators";
import { signManagementAccessToken } from "../auth/helpers";

const looseV: any = v;
const defineInternalAction: any = internalAction;
interface VerificationContext {
  identity: RuntimeSiteIdentity;
  authority: (StoredManagementAuthority & {
    authorityId: GenericId<"convexpress_managementAuthorities">;
  }) | null;
  nonceUsed: boolean;
}

interface ExchangeResult {
  token: string;
  controllerId: string;
  syntheticOperatorId: string;
  capabilities: RuntimeManagementCapabilityCode[];
  siteRole: RuntimeSiteSessionRoleSlug;
  siteCapabilities: string[];
  expiresAt: number;
}

interface ExchangeArgs {
  envelope: RuntimeSignedManagementEnvelope;
  body: { requestedCapabilities: string[]; requestedSiteRole: string };
}

interface ManagementActionCtx {
  runQuery: (reference: any, args: unknown) => Promise<any>;
  runMutation: (reference: any, args: unknown) => Promise<any>;
}

export const exchangeSession = defineInternalAction({
  args: {
    envelope: managementEnvelopeValidator,
    body: looseV.object({
      requestedCapabilities: looseV.array(looseV.string()),
      requestedSiteRole: looseV.string(),
    }),
  },
  returns: looseV.object({
    token: looseV.string(),
    controllerId: looseV.string(),
    syntheticOperatorId: looseV.string(),
    capabilities: looseV.array(looseV.string()),
    siteRole: looseV.string(),
    siteCapabilities: looseV.array(looseV.string()),
    expiresAt: looseV.number(),
  }),
  handler: async (
    ctx: ManagementActionCtx,
    args: ExchangeArgs,
  ): Promise<ExchangeResult> => {
    try {
      const context: VerificationContext | null = await ctx.runQuery(
        anyApi.management.runtime.getVerificationContext,
        {
          controllerId: args.envelope.controllerId,
          keyId: args.envelope.keyId,
          nonce: args.envelope.nonce,
        },
      );
      if (!context?.authority) throw new Error("unavailable");
      const now = Date.now();
      const verified = verifyStoredManagementEnvelope({
        identity: context.identity,
        authority: context.authority,
        envelope: args.envelope as RuntimeSignedManagementEnvelope,
        body: args.body,
        now,
        expectedCapability: "session.exchange",
        usedNonces: context.nonceUsed
          ? new Set([args.envelope.nonce])
          : new Set(),
      });
      if (!verified.ok) throw new Error("verification failed");
      const grant = decideSessionGrant({
        requestedCapabilities: args.body.requestedCapabilities,
        siteCapabilities: context.identity.managementCapabilities,
        authorityCapabilities: context.authority.capabilities,
      });
      if (!grant.allowed) throw new Error("grant failed");
      const expiresAt = getSessionExpiration({
        now,
        envelopeExpiresAt: Date.parse(args.envelope.expiresAt),
        maximumLifetimeMs: 15 * 60_000,
      });
      const sessionToken = `cpms_${randomBytes(32).toString("base64url")}`;
      const tokenHash = createHash("sha256")
        .update(sessionToken, "utf8")
        .digest("hex");
      const created = await ctx.runMutation(
        anyApi.management.runtime.consumeAndCreateSession,
        {
          authorityId: context.authority.authorityId,
          envelope: args.envelope,
          requestedCapabilities: grant.capabilities,
          requestedSiteRole: args.body.requestedSiteRole,
          tokenHash,
          expiresAt,
        },
      );
      const token = await signManagementAccessToken({
        sessionId: String(created.sessionId),
        sessionToken,
        siteRole: created.siteRole,
        expiresAt: created.expiresAt,
      });
      return {
        token,
        controllerId: context.authority.controllerId,
        syntheticOperatorId: created.syntheticOperatorId,
        capabilities: created.capabilities,
        siteRole: created.siteRole,
        siteCapabilities: created.siteCapabilities,
        expiresAt: created.expiresAt,
      };
    } catch {
      throw new Error("Management session exchange failed");
    }
  },
});
