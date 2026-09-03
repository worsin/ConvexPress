import {
  hashRuntimeCanonicalBody,
  RUNTIME_OPERATION_CODES,
} from "@convexpress/site-contract/runtime-protocol";
import { v } from "convex/values";
import {
  internalMutationGeneric as internalMutation,
  internalQueryGeneric as internalQuery,
} from "convex/server";

import { decideSessionGrant, getSessionExpiration } from "./sessionPolicy";
import { parseRequestedSiteRole } from "./sessionPolicy";
import type { ManagementMutationCtx, ManagementQueryCtx } from "./model";
import {
  authorityStatusValidator,
  environmentKindValidator,
  managementEnvelopeValidator,
} from "./validators";

const looseV: any = v;
const defineInternalQuery: any = internalQuery;
const defineInternalMutation: any = internalMutation;
const identityContextValidator = looseV.object({
  websiteKey: looseV.string(),
  instanceKey: looseV.string(),
  environmentKind: environmentKindValidator,
  deploymentOrigin: looseV.string(),
  managementOrigin: looseV.string(),
  siteOrigin: looseV.string(),
  siteContractVersion: looseV.string(),
  schemaVersion: looseV.string(),
  engineVersion: looseV.string(),
  managementCapabilities: looseV.array(looseV.string()),
});

const authorityContextValidator = looseV.object({
  authorityId: looseV.id("convexpress_managementAuthorities"),
  controllerId: looseV.string(),
  keyId: looseV.string(),
  publicKeyPem: looseV.string(),
  websiteKey: looseV.string(),
  instanceKey: looseV.string(),
  capabilities: looseV.array(looseV.string()),
  capabilityRevision: looseV.number(),
  status: authorityStatusValidator,
  notBefore: looseV.number(),
  expiresAt: looseV.optional(looseV.number()),
});

interface VerificationContextArgs {
  controllerId: string;
  keyId: string;
  nonce: string;
}

interface ConsumeSessionArgs {
  authorityId: string;
  envelope: {
    contractVersion: string;
    controllerId: string;
    keyId: string;
    websiteKey: string;
    instanceKey: string;
    operationCode: string;
    bodyHash: string;
    nonce: string;
    issuedAt: string;
    expiresAt: string;
  };
  requestedCapabilities: string[];
  requestedSiteRole: string;
  tokenHash: string;
  expiresAt: number;
}

export const getVerificationContext = defineInternalQuery({
  args: {
    controllerId: looseV.string(),
    keyId: looseV.string(),
    nonce: looseV.string(),
  },
  returns: looseV.union(
    looseV.null(),
    looseV.object({
      identity: identityContextValidator,
      authority: looseV.union(looseV.null(), authorityContextValidator),
      nonceUsed: looseV.boolean(),
    }),
  ),
  handler: async (ctx: ManagementQueryCtx, args: VerificationContextArgs) => {
    const identity = await ctx.db
      .query("convexpress_siteIdentity")
      .withIndex("by_identity_key", (q: any) => q.eq("identityKey", "site-identity"))
      .unique();
    if (!identity) return null;
    const authority = await ctx.db
      .query("convexpress_managementAuthorities")
      .withIndex("by_controller_key", (q: any) =>
        q.eq("controllerId", args.controllerId).eq("keyId", args.keyId),
      )
      .unique();
    const nonce = authority
      ? await ctx.db
          .query("convexpress_managementNonces")
          .withIndex("by_authority_nonce", (q: any) =>
            q.eq("authorityId", authority._id).eq("nonce", args.nonce),
          )
          .unique()
      : null;
    return {
      identity: {
        websiteKey: identity.websiteKey,
        instanceKey: identity.instanceKey,
        environmentKind: identity.environmentKind,
        deploymentOrigin: identity.deploymentOrigin,
        managementOrigin: identity.managementOrigin,
        siteOrigin: identity.siteOrigin,
        siteContractVersion: identity.siteContractVersion,
        schemaVersion: identity.schemaVersion,
        engineVersion: identity.engineVersion,
        managementCapabilities: identity.managementCapabilities,
      },
      authority: authority
        ? {
            authorityId: authority._id,
            controllerId: authority.controllerId,
            keyId: authority.keyId,
            publicKeyPem: authority.publicKeyPem,
            websiteKey: authority.websiteKey,
            instanceKey: authority.instanceKey,
            capabilities: authority.capabilities,
            capabilityRevision: authority.capabilityRevision,
            status: authority.status,
            notBefore: authority.notBefore,
            expiresAt: authority.expiresAt,
          }
        : null,
      nonceUsed: nonce !== null,
    };
  },
});

export const consumeAndCreateSession = defineInternalMutation({
  args: {
    authorityId: looseV.id("convexpress_managementAuthorities"),
    envelope: managementEnvelopeValidator,
    requestedCapabilities: looseV.array(looseV.string()),
    requestedSiteRole: looseV.string(),
    tokenHash: looseV.string(),
    expiresAt: looseV.number(),
  },
  returns: looseV.object({
    sessionId: looseV.id("convexpress_managementSessions"),
    userId: looseV.id("users"),
    syntheticOperatorId: looseV.string(),
    capabilities: looseV.array(looseV.string()),
    siteRole: looseV.string(),
    siteCapabilities: looseV.array(looseV.string()),
    expiresAt: looseV.number(),
  }),
  handler: async (ctx: ManagementMutationCtx, args: ConsumeSessionArgs) => {
    const now = Date.now();
    const identity = await ctx.db
      .query("convexpress_siteIdentity")
      .withIndex("by_identity_key", (q: any) => q.eq("identityKey", "site-identity"))
      .unique();
    const authority = await ctx.db.get(args.authorityId);
    if (!identity || !authority || authority.status !== "active") {
      throw new Error("Management authority is unavailable");
    }
    if (
      authority.controllerId !== args.envelope.controllerId ||
      authority.keyId !== args.envelope.keyId ||
      authority.websiteKey !== identity.websiteKey ||
      authority.instanceKey !== identity.instanceKey ||
      args.envelope.websiteKey !== identity.websiteKey ||
      args.envelope.instanceKey !== identity.instanceKey ||
      args.envelope.contractVersion !== identity.siteContractVersion ||
      args.envelope.operationCode !== RUNTIME_OPERATION_CODES.sessionExchange
    ) {
      throw new Error("Management authority target is invalid");
    }
    if (
      now < authority.notBefore ||
      (authority.expiresAt !== undefined && now >= authority.expiresAt) ||
      now < Date.parse(args.envelope.issuedAt) ||
      now >= Date.parse(args.envelope.expiresAt)
    ) {
      throw new Error("Management authority is outside its validity window");
    }
    if (
      hashRuntimeCanonicalBody({
        requestedCapabilities: args.requestedCapabilities,
        requestedSiteRole: args.requestedSiteRole,
      }) !==
      args.envelope.bodyHash
    ) {
      throw new Error("Management session body does not match its envelope");
    }
    const grant = decideSessionGrant({
      requestedCapabilities: args.requestedCapabilities,
      siteCapabilities: identity.managementCapabilities,
      authorityCapabilities: authority.capabilities,
    });
    if (!grant.allowed) throw new Error("Management session grant is invalid");
    const expectedExpiration = getSessionExpiration({
      now,
      envelopeExpiresAt: Date.parse(args.envelope.expiresAt),
      maximumLifetimeMs: 15 * 60_000,
    });
    if (args.expiresAt !== expectedExpiration) {
      throw new Error("Management session expiration is invalid");
    }
    if (!/^[a-f0-9]{64}$/.test(args.tokenHash)) {
      throw new Error("Management session token hash is invalid");
    }
    const usedNonce = await ctx.db
      .query("convexpress_managementNonces")
      .withIndex("by_authority_nonce", (q: any) =>
        q.eq("authorityId", authority._id).eq("nonce", args.envelope.nonce),
      )
      .unique();
    if (usedNonce) throw new Error("Management envelope nonce was already used");
    const existingToken = await ctx.db
      .query("convexpress_managementSessions")
      .withIndex("by_token_hash", (q: any) => q.eq("tokenHash", args.tokenHash))
      .unique();
    if (existingToken) throw new Error("Management session token already exists");
    const bindings = await ctx.db
      .query("convexpress_managementBindings")
      .withIndex("by_authority", (q: any) => q.eq("authorityId", authority._id))
      .take(2);
    const binding = bindings.find(
      (candidate: any) =>
        candidate.status === "active" &&
        candidate.capabilityRevision === authority.capabilityRevision,
    );
    if (!binding || bindings.length !== 1) {
      throw new Error("Management authority binding is invalid");
    }

    const siteRoleSlug = parseRequestedSiteRole(args.requestedSiteRole);
    const siteRole = await ctx.db
      .query("roles")
      .withIndex("by_slug", (q: any) => q.eq("slug", siteRoleSlug))
      .unique();
    const administratorRole = await ctx.db
      .query("roles")
      .withIndex("by_slug", (q: any) => q.eq("slug", "administrator"))
      .unique();
    if (
      !siteRole ||
      siteRole.status !== "active" ||
      !administratorRole ||
      administratorRole.status !== "active" ||
      administratorRole.type !== "internal"
    ) {
      throw new Error("Site session role is unavailable");
    }

    let user = binding.userId ? await ctx.db.get(binding.userId) : null;
    if (user) {
      if (
        user.authSource !== "management" ||
        user.status !== "active" ||
        user.roleId !== administratorRole._id
      ) {
        throw new Error("Management operator binding is invalid");
      }
    } else {
      const operatorKey = `${authority.controllerId}|${authority.keyId}`;
      const digest = hashRuntimeCanonicalBody(operatorKey).slice(0, 24);
      const email = `management-${digest}@operators.convexpress.invalid`;
      const collision = await ctx.db
        .query("users")
        .withIndex("by_email", (q: any) => q.eq("email", email))
        .unique();
      if (collision) {
        if (collision.authSource !== "management") {
          throw new Error("Management operator identity collides with a site user");
        }
        user = collision;
      } else {
        const userId = await ctx.db.insert("users", {
          authSource: "management",
          email,
          emailVerified: true,
          displayName: authority.label
            ? `Managed by ${authority.label}`
            : "Managed ConvexPress Operator",
          roleId: administratorRole._id,
          status: "active",
          registrationMethod: "management_authority",
          isInternal: true,
          internalRole: "management",
          createdAt: now,
          updatedAt: now,
        });
        user = await ctx.db.get(userId);
      }
      if (!user) throw new Error("Management operator could not be created");
      await ctx.db.patch(binding._id, {
        userId: user._id,
        syntheticOperatorId: String(user._id),
        updatedAt: now,
      });
    }

    await ctx.db.insert("convexpress_managementNonces", {
      authorityId: authority._id,
      nonce: args.envelope.nonce,
      expiresAt: Date.parse(args.envelope.expiresAt),
      consumedAt: now,
    });
    const sessionId = await ctx.db.insert("convexpress_managementSessions", {
      tokenHash: args.tokenHash,
      authorityId: authority._id,
      bindingId: binding._id,
      userId: user._id,
      websiteKey: identity.websiteKey,
      instanceKey: identity.instanceKey,
      capabilities: grant.capabilities,
      siteRoleSlug,
      siteCapabilities: [...siteRole.capabilities].sort(),
      capabilityRevision: authority.capabilityRevision,
      expiresAt: args.expiresAt,
      status: "active",
      createdAt: now,
    });
    return {
      sessionId,
      userId: user._id,
      syntheticOperatorId: String(user._id),
      capabilities: grant.capabilities,
      siteRole: siteRoleSlug,
      siteCapabilities: [...siteRole.capabilities].sort(),
      expiresAt: args.expiresAt,
    };
  },
});
