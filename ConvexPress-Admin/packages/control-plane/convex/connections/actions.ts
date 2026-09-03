"use node";

import { randomBytes } from "node:crypto";

import {
  MANAGEMENT_CAPABILITY_CODES,
  siteHealthResponseSchema,
} from "@convexpress/site-contract";
import { generateManagementKeyPair } from "@convexpress/site-contract/node";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";

import { internal } from "../_generated/api";
import { action } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import {
  createControllerCredential,
  parseControllerCredential,
} from "./controllerCredentials";
import {
  decryptCredentialPayload,
  encryptCredentialPayload,
  parseEnvelopeKey,
  parseEnvelopeKeys,
} from "./crypto";

const actionResult = v.object({
  connectionId: v.id("overseer_connections"),
  status: v.union(
    v.literal("connected"),
    v.literal("healthy"),
    v.literal("revoked"),
  ),
  credentialVersion: v.union(v.number(), v.null()),
});

interface ConnectionActionTarget {
  connectionId: Id<"overseer_connections">;
  instanceId: Id<"overseer_websiteInstances">;
  websiteKey: string;
  instanceKey: string;
  deploymentOrigin: string;
  managementOrigin: string;
  siteOrigin: string;
  kind:
    | "live"
    | "staging"
    | "beta"
    | "preview"
    | "development"
    | "local"
    | "custom";
  credentials: {
    encrypted: string;
    iv: string;
    authTag: string;
    createdAt: number;
    updatedAt: number;
    lastRotatedAt: number;
    version: number;
  } | null;
}

interface ConnectionActionResult {
  connectionId: Id<"overseer_connections">;
  status: "connected" | "healthy" | "revoked";
  credentialVersion: number | null;
}

const enrollAuthority = makeFunctionReference<"mutation">(
  "management/bootstrap:enrollAuthority",
);
const revokeAuthority = makeFunctionReference<"mutation">(
  "management/bootstrap:revokeAuthority",
);
const CONTROLLER_ID = "controller_convexpress_standalone";

function siteAdminClient(deploymentOrigin: string, deploymentAdminKey: string) {
  const client = new ConvexHttpClient(deploymentOrigin);
  (client as ConvexHttpClient & { setAdminAuth: (token: string) => void })
    .setAdminAuth(deploymentAdminKey);
  return client;
}

function cleanCredentialPayload(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Connection credentials must be an object");
  }
  const serialized = JSON.stringify(value);
  if (serialized.length < 2 || Buffer.byteLength(serialized, "utf8") > 65_536) {
    throw new Error("Connection credential payload is invalid");
  }
  return JSON.parse(serialized) as Record<string, unknown>;
}

function aad(target: {
  websiteKey: string;
  instanceKey: string;
  connectionId: unknown;
}) {
  return `${target.websiteKey}|${target.instanceKey}|${String(target.connectionId)}`;
}

async function probeTargetIdentity(target: {
  managementOrigin: string;
  websiteKey: string;
  instanceKey: string;
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(
      `${target.managementOrigin}/api/convexpress/management/health`,
      {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      },
    );
    if (!response.ok) throw new Error("unreachable");
    const length = Number(response.headers.get("content-length") ?? "0");
    if (Number.isFinite(length) && length > 65_536) throw new Error("oversized");
    const health = siteHealthResponseSchema.parse(await response.json());
    if (
      health.websiteKey !== target.websiteKey ||
      health.instanceKey !== target.instanceKey
    ) {
      throw new Error("target mismatch");
    }
    return health;
  } catch {
    throw new Error("Site target identity could not be verified");
  } finally {
    clearTimeout(timeout);
  }
}

function activeKeys() {
  return parseEnvelopeKeys({
    serializedKeys: process.env.CONVEXPRESS_CONNECTION_ENVELOPE_KEYS,
    activeVersion: process.env.CONVEXPRESS_CONNECTION_ACTIVE_KEY_VERSION,
  });
}

export const create = action({
  args: {
    instanceId: v.id("overseer_websiteInstances"),
    name: v.string(),
    accountLabel: v.optional(v.string()),
    deploymentAdminKey: v.string(),
  },
  returns: actionResult,
  handler: async (ctx, args): Promise<ConnectionActionResult> => {
    let connectionId: Id<"overseer_connections"> | null = null;
    let enrolled:
      | {
          client: ConvexHttpClient;
          controllerId: string;
          keyId: string;
        }
      | null = null;
    try {
      const target: ConnectionActionTarget = await ctx.runMutation(
        internal.connections.mutations.createPending,
        {
          instanceId: args.instanceId,
          name: args.name,
          accountLabel: args.accountLabel,
        },
      );
      connectionId = target.connectionId;
      await probeTargetIdentity(target);
      const pair = generateManagementKeyPair();
      const credential = createControllerCredential({
        controllerId: CONTROLLER_ID,
        keyId: `key_${randomBytes(16).toString("hex")}`,
        privateKeyPem: pair.privateKeyPem,
        deploymentAdminKey: args.deploymentAdminKey,
        capabilities: MANAGEMENT_CAPABILITY_CODES,
      });
      const client = siteAdminClient(
        target.deploymentOrigin,
        credential.deploymentAdminKey,
      );
      await client.mutation(enrollAuthority, {
        controllerId: credential.controllerId,
        keyId: credential.keyId,
        label: "Standalone ConvexPress controller",
        publicKeyPem: pair.publicKeyPem,
        capabilities: credential.capabilities,
      });
      enrolled = {
        client,
        controllerId: credential.controllerId,
        keyId: credential.keyId,
      };
      const keys = activeKeys();
      const envelope = encryptCredentialPayload({
        payload: cleanCredentialPayload(credential),
        key: keys.key,
        keyVersion: keys.activeVersion,
        aad: aad(target),
      });
      await ctx.runMutation(internal.connections.mutations.saveEnvelope, {
        connectionId: target.connectionId,
        envelope,
      });
      return {
        connectionId: target.connectionId,
        status: "connected" as const,
        credentialVersion: envelope.version,
      };
    } catch {
      if (enrolled) {
        try {
          await enrolled.client.mutation(revokeAuthority, {
            controllerId: enrolled.controllerId,
            keyId: enrolled.keyId,
          });
        } catch {
          // The public error remains secret-free; an operator can revoke this
          // public-key authority with the supplied site admin credential.
        }
      }
      if (connectionId) {
        await ctx.runMutation(internal.connections.mutations.markError, {
          connectionId,
          errorCode: "CONNECTION_CREATE_FAILED",
        });
      }
      throw new Error("Connection could not be created or verified");
    }
  },
});

export const rotate = action({
  args: {
    connectionId: v.id("overseer_connections"),
    deploymentAdminKey: v.optional(v.string()),
  },
  returns: actionResult,
  handler: async (ctx, args): Promise<ConnectionActionResult> => {
    let target: ConnectionActionTarget | null = null;
    let previousCredential: ReturnType<typeof parseControllerCredential> | null = null;
    let nextCredential: ReturnType<typeof parseControllerCredential> | null = null;
    let adminClient: ConvexHttpClient | null = null;
    try {
      target = await ctx.runQuery(internal.connections.mutations.prepare, {
        connectionId: args.connectionId,
      }) as ConnectionActionTarget;
      if (!target.credentials) throw new Error("missing credentials");
      await probeTargetIdentity(target);
      const previousKey = parseEnvelopeKey(
        process.env.CONVEXPRESS_CONNECTION_ENVELOPE_KEYS,
        target.credentials.version,
      );
      previousCredential = parseControllerCredential(
        decryptCredentialPayload({
          envelope: target.credentials,
          key: previousKey,
          aad: aad(target),
        }),
      );
      const pair = generateManagementKeyPair();
      nextCredential = createControllerCredential({
        controllerId: previousCredential.controllerId,
        keyId: `key_${randomBytes(16).toString("hex")}`,
        privateKeyPem: pair.privateKeyPem,
        deploymentAdminKey:
          args.deploymentAdminKey ?? previousCredential.deploymentAdminKey,
        capabilities: previousCredential.capabilities,
      });
      adminClient = siteAdminClient(
        target.deploymentOrigin,
        nextCredential.deploymentAdminKey,
      );
      await adminClient.mutation(enrollAuthority, {
        controllerId: nextCredential.controllerId,
        keyId: nextCredential.keyId,
        label: "Standalone ConvexPress controller",
        publicKeyPem: pair.publicKeyPem,
        capabilities: nextCredential.capabilities,
      });
      const keys = activeKeys();
      const envelope = encryptCredentialPayload({
        payload: cleanCredentialPayload(nextCredential),
        key: keys.key,
        keyVersion: keys.activeVersion,
        aad: aad(target),
      });
      await ctx.runMutation(internal.connections.mutations.saveEnvelope, {
        connectionId: args.connectionId,
        envelope,
      });
      try {
        await adminClient.mutation(revokeAuthority, {
          controllerId: previousCredential.controllerId,
          keyId: previousCredential.keyId,
        });
      } catch {
        await ctx.runMutation(internal.connections.mutations.saveEnvelope, {
          connectionId: args.connectionId,
          envelope: target.credentials,
        });
        try {
          await adminClient.mutation(revokeAuthority, {
            controllerId: nextCredential.controllerId,
            keyId: nextCredential.keyId,
          });
        } catch {
          // Both public keys may remain enrolled, but the prior encrypted
          // controller stays authoritative and no secret is exposed.
        }
        throw new Error("prior authority could not be revoked");
      }
      return {
        connectionId: args.connectionId,
        status: "connected" as const,
        credentialVersion: envelope.version,
      };
    } catch {
      if (adminClient && nextCredential && previousCredential && target) {
        try {
          await adminClient.mutation(revokeAuthority, {
            controllerId: nextCredential.controllerId,
            keyId: nextCredential.keyId,
          });
        } catch {
          // Keep the public failure generic and the previous credential intact.
        }
      }
      throw new Error("Connection credentials could not be rotated");
    }
  },
});

export const test = action({
  args: { connectionId: v.id("overseer_connections") },
  returns: actionResult,
  handler: async (ctx, args): Promise<ConnectionActionResult> => {
    const startedAt = Date.now();
    try {
      const target: ConnectionActionTarget = await ctx.runQuery(internal.connections.mutations.prepare, {
        connectionId: args.connectionId,
      });
      if (!target.credentials) throw new Error("missing credentials");
      const key = parseEnvelopeKey(
        process.env.CONVEXPRESS_CONNECTION_ENVELOPE_KEYS,
        target.credentials.version,
      );
      parseControllerCredential(decryptCredentialPayload({
        envelope: target.credentials,
        key,
        aad: aad(target),
      }));
      await probeTargetIdentity(target);
      await ctx.runMutation(internal.connections.mutations.recordHealth, {
        connectionId: args.connectionId,
        status: "healthy",
        latencyMs: Date.now() - startedAt,
      });
      return {
        connectionId: args.connectionId,
        status: "healthy" as const,
        credentialVersion: target.credentials.version,
      };
    } catch {
      await ctx.runMutation(internal.connections.mutations.recordHealth, {
        connectionId: args.connectionId,
        status: "unreachable",
        latencyMs: Date.now() - startedAt,
        errorCode: "CONNECTION_TEST_FAILED",
      });
      throw new Error("Connection test failed");
    }
  },
});

export const revoke = action({
  args: { connectionId: v.id("overseer_connections") },
  returns: actionResult,
  handler: async (ctx, args): Promise<ConnectionActionResult> => {
    const target: ConnectionActionTarget = await ctx.runQuery(
      internal.connections.mutations.prepare,
      { connectionId: args.connectionId },
    );
    if (!target.credentials) throw new Error("Connection could not be revoked");
    try {
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
      const client = siteAdminClient(
        target.deploymentOrigin,
        credential.deploymentAdminKey,
      );
      await client.mutation(revokeAuthority, {
        controllerId: credential.controllerId,
        keyId: credential.keyId,
      });
    } catch {
      throw new Error("Connection could not be revoked");
    }
    await ctx.runMutation(internal.connections.mutations.revoke, {
      connectionId: args.connectionId,
    });
    return {
      connectionId: args.connectionId,
      status: "revoked" as const,
      credentialVersion: null,
    };
  },
});
