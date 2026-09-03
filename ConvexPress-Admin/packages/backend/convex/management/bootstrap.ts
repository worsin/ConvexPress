import {
  parseRuntimePortableKey,
  parseRuntimeSiteIdentity,
  RUNTIME_MANAGEMENT_CAPABILITY_CODES,
  type RuntimeManagementCapabilityCode,
} from "@convexpress/site-contract/runtime-protocol";
import { sha256Hex } from "@convexpress/site-contract/runtime-protocol";
import { v } from "convex/values";
import { internalMutationGeneric as internalMutation } from "convex/server";

import type { ManagementMutationCtx } from "./model";
import {
  environmentKindValidator,
} from "./validators";

const looseV: any = v;
const defineInternalMutation: any = internalMutation;
const KNOWN_MANAGEMENT_CAPABILITIES = new Set<string>(
  RUNTIME_MANAGEMENT_CAPABILITY_CODES,
);

const configureResult = looseV.object({
  identityId: looseV.id("convexpress_siteIdentity"),
  idempotent: looseV.boolean(),
});

const authorityResult = looseV.object({
  authorityId: looseV.id("convexpress_managementAuthorities"),
  bindingId: looseV.id("convexpress_managementBindings"),
  idempotent: looseV.boolean(),
});

const revokeResult = looseV.object({
  authorityId: looseV.id("convexpress_managementAuthorities"),
  idempotent: looseV.boolean(),
});

interface ConfigureIdentityArgs {
  websiteKey: string;
  instanceKey: string;
  environmentKind: "live" | "staging" | "beta" | "preview" | "development" | "local" | "custom";
  deploymentOrigin: string;
  managementOrigin: string;
  siteOrigin: string;
  siteContractVersion: string;
  schemaVersion: string;
  engineVersion: string;
  managementCapabilities: string[];
}

interface EnrollAuthorityArgs {
  controllerId: string;
  keyId: string;
  label?: string;
  publicKeyPem: string;
  capabilities: string[];
  notBefore?: number;
  expiresAt?: number;
}

interface RevokeAuthorityArgs {
  controllerId: string;
  keyId: string;
}

function uniqueCapabilities(
  capabilities: string[],
): RuntimeManagementCapabilityCode[] {
  if (
    capabilities.length === 0 ||
    capabilities.length > 64 ||
    new Set(capabilities).size !== capabilities.length ||
    capabilities.some(
      (capability) => !KNOWN_MANAGEMENT_CAPABILITIES.has(capability),
    )
  ) {
    throw new Error("Management capabilities must be unique and non-empty");
  }
  return [...capabilities].sort() as RuntimeManagementCapabilityCode[];
}

function validatePublicKeyPem(publicKeyPem: string): string {
  const value = publicKeyPem.trim();
  if (
    value.length < 80 ||
    value.length > 4_096 ||
    !value.startsWith("-----BEGIN PUBLIC KEY-----\n") ||
    !value.endsWith("\n-----END PUBLIC KEY-----") ||
    value.includes("PRIVATE KEY")
  ) {
    throw new Error("Controller public key is invalid");
  }
  return value;
}

export const configureIdentity = defineInternalMutation({
  args: {
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
  },
  returns: configureResult,
  handler: async (ctx: ManagementMutationCtx, args: ConfigureIdentityArgs) => {
    const parsed = parseRuntimeSiteIdentity({
      ...args,
      managementCapabilities: uniqueCapabilities(args.managementCapabilities),
    });
    const existing = await ctx.db
      .query("convexpress_siteIdentity")
      .withIndex("by_identity_key", (q: any) => q.eq("identityKey", "site-identity"))
      .unique();
    const now = Date.now();
    if (existing) {
      if (
        existing.websiteKey !== parsed.websiteKey ||
        existing.instanceKey !== parsed.instanceKey
      ) {
        throw new Error("Site identity cannot be rebound to another audience");
      }
      await ctx.db.patch(existing._id, {
        environmentKind: parsed.environmentKind,
        deploymentOrigin: parsed.deploymentOrigin,
        managementOrigin: parsed.managementOrigin,
        siteOrigin: parsed.siteOrigin,
        siteContractVersion: parsed.siteContractVersion,
        schemaVersion: parsed.schemaVersion,
        engineVersion: parsed.engineVersion,
        managementCapabilities: parsed.managementCapabilities,
        updatedAt: now,
      });
      return { identityId: existing._id, idempotent: true };
    }
    const identityId = await ctx.db.insert("convexpress_siteIdentity", {
      identityKey: "site-identity",
      ...parsed,
      initializedAt: now,
      updatedAt: now,
    });
    return { identityId, idempotent: false };
  },
});

export const enrollAuthority = defineInternalMutation({
  args: {
    controllerId: looseV.string(),
    keyId: looseV.string(),
    label: looseV.optional(looseV.string()),
    publicKeyPem: looseV.string(),
    capabilities: looseV.array(looseV.string()),
    notBefore: looseV.optional(looseV.number()),
    expiresAt: looseV.optional(looseV.number()),
  },
  returns: authorityResult,
  handler: async (ctx: ManagementMutationCtx, args: EnrollAuthorityArgs) => {
    const identity = await ctx.db
      .query("convexpress_siteIdentity")
      .withIndex("by_identity_key", (q: any) => q.eq("identityKey", "site-identity"))
      .unique();
    if (!identity) throw new Error("Site identity must be configured first");

    const controllerId = parseRuntimePortableKey(args.controllerId);
    const keyId = parseRuntimePortableKey(args.keyId);
    const publicKeyPem = validatePublicKeyPem(args.publicKeyPem);
    const capabilities = uniqueCapabilities(args.capabilities);
    const siteCapabilities = new Set(identity.managementCapabilities);
    if (capabilities.some((capability) => !siteCapabilities.has(capability))) {
      throw new Error("Authority capability is not supported by this site");
    }
    const now = Date.now();
    const notBefore = args.notBefore ?? now;
    if (
      !Number.isSafeInteger(notBefore) ||
      (args.expiresAt !== undefined &&
        (!Number.isSafeInteger(args.expiresAt) || args.expiresAt <= notBefore))
    ) {
      throw new Error("Authority validity window is invalid");
    }
    const fingerprintSha256 = sha256Hex(publicKeyPem);
    const existing = await ctx.db
      .query("convexpress_managementAuthorities")
      .withIndex("by_controller_key", (q: any) =>
        q.eq("controllerId", controllerId).eq("keyId", keyId),
      )
      .unique();
    if (existing) {
      const binding = await ctx.db
        .query("convexpress_managementBindings")
        .withIndex("by_authority", (q: any) => q.eq("authorityId", existing._id))
        .unique();
      if (
        !binding ||
        existing.status !== "active" ||
        existing.fingerprintSha256 !== fingerprintSha256 ||
        JSON.stringify(existing.capabilities) !== JSON.stringify(capabilities) ||
        existing.notBefore !== notBefore ||
        existing.expiresAt !== args.expiresAt
      ) {
        throw new Error("Controller key already exists with different authority data");
      }
      return {
        authorityId: existing._id,
        bindingId: binding._id,
        idempotent: true,
      };
    }

    const authorityId = await ctx.db.insert(
      "convexpress_managementAuthorities",
      {
        controllerId,
        keyId,
        label: args.label?.trim().slice(0, 160) || undefined,
        publicKeyPem,
        fingerprintSha256,
        websiteKey: identity.websiteKey,
        instanceKey: identity.instanceKey,
        capabilities,
        capabilityRevision: 1,
        status: "active",
        notBefore,
        expiresAt: args.expiresAt,
        enrolledAt: now,
        updatedAt: now,
      },
    );
    const bindingId = await ctx.db.insert("convexpress_managementBindings", {
      authorityId,
      controllerId,
      syntheticOperatorId: `controller:${controllerId}:${keyId}`,
      capabilityRevision: 1,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    return { authorityId, bindingId, idempotent: false };
  },
});

export const revokeAuthority = defineInternalMutation({
  args: { controllerId: looseV.string(), keyId: looseV.string() },
  returns: revokeResult,
  handler: async (ctx: ManagementMutationCtx, args: RevokeAuthorityArgs) => {
    const controllerId = parseRuntimePortableKey(args.controllerId);
    const keyId = parseRuntimePortableKey(args.keyId);
    const authority = await ctx.db
      .query("convexpress_managementAuthorities")
      .withIndex("by_controller_key", (q: any) =>
        q.eq("controllerId", controllerId).eq("keyId", keyId),
      )
      .unique();
    if (!authority) throw new Error("Management authority not found");
    if (authority.status === "revoked") {
      return { authorityId: authority._id, idempotent: true };
    }

    const sessions = await ctx.db
      .query("convexpress_managementSessions")
      .withIndex("by_authority", (q: any) =>
        q.eq("authorityId", authority._id).eq("status", "active"),
      )
      .take(501);
    if (sessions.length > 500) {
      throw new Error("Authority has too many sessions for one revocation batch");
    }
    const bindings = await ctx.db
      .query("convexpress_managementBindings")
      .withIndex("by_authority", (q: any) => q.eq("authorityId", authority._id))
      .take(11);
    if (bindings.length > 10) {
      throw new Error("Authority has an invalid binding count");
    }

    const now = Date.now();
    await ctx.db.patch(authority._id, {
      status: "revoked",
      revokedAt: now,
      updatedAt: now,
    });
    for (const binding of bindings) {
      if (binding.status === "active") {
        await ctx.db.patch(binding._id, {
          status: "revoked",
          revokedAt: now,
          updatedAt: now,
        });
      }
    }
    for (const session of sessions) {
      await ctx.db.patch(session._id, {
        status: "revoked",
        revokedAt: now,
      });
    }
    return { authorityId: authority._id, idempotent: false };
  },
});
