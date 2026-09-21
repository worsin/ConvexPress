"use node";

import { randomBytes } from "node:crypto";

import {
  MANAGEMENT_CAPABILITY_CODES,
} from "@convexpress/site-contract";
import { generateManagementKeyPair } from "@convexpress/site-contract/node";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { ConvexError, v } from "convex/values";

import { internal } from "../_generated/api";
import { operatorAction } from "../rbac/functions";
import { action, type ActionCtx } from "../_generated/server";
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
import { probeControllerAuthority } from "./authorityProbe";
import { probeTargetIdentity } from "./healthProbe";
import { healthEvidence } from "./healthEvidence";

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
  controllerSubjectId: string;
  connectionRevision: number;
  targetRevision: string;
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


function activeKeys() {
  return parseEnvelopeKeys({
    serializedKeys: process.env.CONVEXPRESS_CONNECTION_ENVELOPE_KEYS,
    activeVersion: process.env.CONVEXPRESS_CONNECTION_ACTIVE_KEY_VERSION,
  });
}

/**
 * Secret-free, bounded description of why a connect/rotate attempt failed.
 * The admin key is scrubbed defensively even though no code path echoes it.
 */
function describeConnectionFailure(cause: unknown, adminKey: string): string {
  const raw =
    cause instanceof ConvexError
      ? typeof cause.data === "object" && cause.data && "message" in cause.data
        ? String((cause.data as { message: unknown }).message)
        : String(cause.data)
      : cause instanceof Error
        ? cause.message
        : String(cause);
  const scrubbed = raw.split(adminKey).join("••••").replace(/\s+/g, " ").trim();
  const stripped = scrubbed.replace(/^\[Request ID: [^\]]+\]\s*/u, "");
  return (stripped || "unknown error").slice(0, 200);
}

export const create = operatorAction({
  args: {
    instanceId: v.id("overseer_websiteInstances"),
    name: v.string(),
    accountLabel: v.optional(v.string()),
    deploymentAdminKey: v.string(),
  },
  returns: actionResult,
  handler: async (ctx, args): Promise<ConnectionActionResult> => {
    let connectionId: Id<"overseer_connections"> | null = null;
    let sealed = false;
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
      // Public identity alone is insufficient authority to enroll after a slow
      // probe. Reauthorize the current operator and exact target before writing.
      const current = await ctx.runQuery(internal.connections.mutations.prepare, { connectionId: target.connectionId });
      if (!sameConnectionTarget(target, current)) throw Error("Connection target changed before enrollment");
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
      sealed = true;
      return await verifyConnection(ctx, target.connectionId, { target, credentialIv: envelope.iv });
    } catch (cause) {
      if (sealed) {
        // This key is now durable and may already have been rotated/revoked by
        // another operation. Keep it retryable; guarded verification owns health
        // evidence. Never deactivate or revoke a newer current connection here.
        throw new Error("Connection credentials were saved, but signed verification failed. Retry the connection test.");
      }
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
      const reason = describeConnectionFailure(cause, args.deploymentAdminKey);
      if (connectionId) {
        try {
          await ctx.runMutation(internal.connections.mutations.markError, {
            connectionId,
            errorCode: `CONNECTION_CREATE_FAILED: ${reason}`,
          });
        } catch {
          // Recording the failure must not mask the failure itself.
        }
      }
      throw new Error(`Connection could not be created or verified (${reason})`);
    }
  },
});

export const rotate = operatorAction({
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

function sameConnectionTarget(left: ConnectionActionTarget, right: ConnectionActionTarget) {
  return (["connectionId", "instanceId", "controllerSubjectId", "websiteKey", "instanceKey", "deploymentOrigin", "managementOrigin", "siteOrigin", "kind"] as const).every(key => left[key] === right[key]);
}

async function verifyConnection(ctx: Pick<ActionCtx, "runQuery" | "runMutation">, connectionId: Id<"overseer_connections">, expected?: { target: ConnectionActionTarget; credentialIv: string }): Promise<ConnectionActionResult> {
    const startedAt = Date.now();
    let target: ConnectionActionTarget | null = null;
    let report: Awaited<ReturnType<typeof probeTargetIdentity>>;
    try {
      const current: ConnectionActionTarget = await ctx.runQuery(internal.connections.mutations.prepare, { connectionId });
      if (expected && (!sameConnectionTarget(expected.target, current) || current.credentials?.iv !== expected.credentialIv)) throw Error("Connection changed before verification");
      target = current;
      if (!target?.credentials) throw new Error("missing credentials");
      const key = parseEnvelopeKey(process.env.CONVEXPRESS_CONNECTION_ENVELOPE_KEYS, target.credentials.version);
      const credential = parseControllerCredential(decryptCredentialPayload({ envelope: target.credentials, key, aad: aad(target) }));
      report = await probeTargetIdentity(target);
      await probeControllerAuthority({ ...target, credential });
    } catch {
      if (target?.credentials) {
        try {
          await ctx.runMutation(internal.connections.mutations.recordHealth, {
            connectionId: connectionId,
            connectionRevision: target.connectionRevision, targetRevision: target.targetRevision,
            credentialIv: target.credentials.iv,
            latencyMs: Date.now() - startedAt, errorCode: "CONNECTION_TEST_FAILED",
          });
        } catch { /* Revoked access or a replaced target must not receive a late failure. */ }
      }
      throw new Error("Connection test failed");
    }
    await ctx.runMutation(internal.connections.mutations.recordHealth, {
      connectionId: connectionId,
      connectionRevision: target.connectionRevision, targetRevision: target.targetRevision,
      credentialIv: target.credentials!.iv, report, latencyMs: Date.now() - startedAt,
    });
    const evidence = healthEvidence(report, target, Date.now());
    if (evidence.health !== "ok" || evidence.compatibility !== "compatible") throw Error("Site reports degraded health or incompatible contracts");
    return { connectionId: connectionId, status: "healthy", credentialVersion: target.credentials!.version };
}

export const test = action({
  args: { connectionId: v.id("overseer_connections") },
  returns: actionResult,
  handler: (ctx, args): Promise<ConnectionActionResult> => verifyConnection(ctx, args.connectionId),
});

export const revoke = operatorAction({
  args: {
    connectionId: v.id("overseer_connections"),
    /**
     * Clear the local credential even when the site cannot be reached to
     * revoke the controller authority remotely (deleted or dead deployment).
     */
    force: v.optional(v.boolean()),
  },
  returns: actionResult,
  handler: async (ctx, args): Promise<ConnectionActionResult> => {
    const target: ConnectionActionTarget = await ctx.runQuery(
      internal.connections.mutations.prepare,
      { connectionId: args.connectionId },
    );
    if (!target.credentials) {
      // Nothing sealed locally (stale pending row): just retire it.
      await ctx.runMutation(internal.connections.mutations.revoke, {
        connectionId: args.connectionId,
      });
      return { connectionId: args.connectionId, status: "revoked" as const, credentialVersion: null };
    }
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
      if (!args.force) {
        throw new Error(
          "The site could not be reached to revoke the controller authority. Retry, or force-revoke to clear the local credential.",
        );
      }
      await ctx.runMutation(internal.connections.mutations.recordHealth, {
        connectionId: args.connectionId,
        connectionRevision: target.connectionRevision, targetRevision: target.targetRevision,
        credentialIv: target.credentials.iv,
        latencyMs: 0,
        errorCode: "FORCE_REVOKED_UNREACHABLE",
      });
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
