"use node";

/**
 * Site auth environment — control-plane side.
 *
 * The website's customer sign-in (Clerk) is trusted by a site deployment only
 * when `CLERK_JWT_ISSUER_DOMAIN` (and the secret key) are live as environment
 * variables on that deployment. The control plane already holds the site's
 * admin key inside the connection envelope, so it can write those variables
 * for the operator instead of sending them to a terminal, and it can lend the
 * desktop app the key for the redeploy that makes a new issuer take effect.
 */

import { siteHealthResponseSchema } from "@convexpress/site-contract";
import { v } from "convex/values";

import { internal } from "../_generated/api";
import { action } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { parseControllerCredential } from "./controllerCredentials";
import { decryptCredentialPayload, parseEnvelopeKey } from "./crypto";

const SITE_AUTH_ENV_NAMES = new Set([
  "CLERK_JWT_ISSUER_DOMAIN",
  "CLERK_SECRET_KEY",
  "CLERK_WEBHOOK_SECRET",
  "CLERK_PUBLISHABLE_KEY",
  "SITE_URL",
]);

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/u;

interface Target {
  connectionId: Id<"overseer_connections">;
  websiteKey: string;
  instanceKey: string;
  deploymentOrigin: string;
  managementOrigin: string;
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

function cleanEnvChanges(
  raw: Array<{ name: string; value: string | null }>,
): Array<{ name: string; value: string | null }> {
  if (raw.length === 0 || raw.length > 8) throw new Error("Provide 1-8 environment changes");
  const seen = new Set<string>();
  return raw.map((change) => {
    const name = change.name.trim();
    if (!SITE_AUTH_ENV_NAMES.has(name)) throw new Error(`${name} is not a site auth variable`);
    if (seen.has(name)) throw new Error(`${name} is listed twice`);
    seen.add(name);
    const value = change.value === null ? null : change.value.trim();
    if (value !== null && (value.length === 0 || value.length > 8_192 || CONTROL_CHARS.test(value))) {
      throw new Error(`Invalid value for ${name}`);
    }
    return { name, value };
  });
}

async function probeTargetIdentity(target: Target) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(`${target.managementOrigin}/api/convexpress/management/health`, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error("unreachable");
    const health = siteHealthResponseSchema.parse(await response.json());
    if (health.websiteKey !== target.websiteKey || health.instanceKey !== target.instanceKey) {
      throw new Error("target mismatch");
    }
  } catch {
    throw new Error("Site target identity could not be verified");
  } finally {
    clearTimeout(timeout);
  }
}

async function loadCredential(ctx: { runQuery: any }, connectionId: Id<"overseer_connections">) {
  const target: Target = await ctx.runQuery(internal.connections.mutations.prepare, { connectionId });
  if (!target.credentials) throw new Error("This environment has no active connection credential");
  const key = parseEnvelopeKey(
    process.env.CONVEXPRESS_CONNECTION_ENVELOPE_KEYS,
    target.credentials.version,
  );
  const credential = parseControllerCredential(
    decryptCredentialPayload({
      envelope: target.credentials,
      key,
      aad: `${target.websiteKey}|${target.instanceKey}|${String(target.connectionId)}`,
    }),
  );
  await probeTargetIdentity(target);
  return { target, credential };
}

/**
 * Write site-auth environment variables on the environment's Convex deployment
 * using the stored admin key. Values never come back out; the site reports the
 * effective issuer itself through its own Clerk status query.
 */
export const applySiteEnvironment = action({
  args: {
    connectionId: v.id("overseer_connections"),
    changes: v.array(v.object({ name: v.string(), value: v.union(v.string(), v.null()) })),
  },
  returns: v.object({ applied: v.array(v.string()) }),
  handler: async (ctx, args): Promise<{ applied: string[] }> => {
    const changes = cleanEnvChanges(args.changes);
    const { target, credential } = await loadCredential(ctx, args.connectionId);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(`${target.deploymentOrigin}/api/update_environment_variables`, {
        method: "POST",
        headers: {
          Authorization: `Convex ${credential.deploymentAdminKey}`,
          "Content-Type": "application/json",
          "Convex-Client": "convexpress-control-plane-1.0.0",
        },
        body: JSON.stringify({ changes }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const text = (await response.text()).slice(0, 200);
        throw new Error(`Deployment rejected the environment update (HTTP ${response.status}) ${text}`);
      }
    } finally {
      clearTimeout(timeout);
    }
    return { applied: changes.map((change) => change.name) };
  },
});

/**
 * Lend the desktop app the deployment admin key so it can run `convex deploy`
 * for this environment. Gated exactly like every other connection action
 * (connection.manage, plus environment.live.operate for live); the desktop
 * keeps it in memory for the duration of the deploy only.
 */
export const issueDeploymentCredential = action({
  args: { connectionId: v.id("overseer_connections") },
  returns: v.object({
    deploymentOrigin: v.string(),
    managementOrigin: v.string(),
    instanceKey: v.string(),
    websiteKey: v.string(),
    deploymentAdminKey: v.string(),
  }),
  handler: async (ctx, args) => {
    const { target, credential } = await loadCredential(ctx, args.connectionId);
    return {
      deploymentOrigin: target.deploymentOrigin,
      managementOrigin: target.managementOrigin,
      instanceKey: target.instanceKey,
      websiteKey: target.websiteKey,
      deploymentAdminKey: credential.deploymentAdminKey,
    };
  },
});
