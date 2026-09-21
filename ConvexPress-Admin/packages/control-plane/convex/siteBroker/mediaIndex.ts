"use node";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import {
  runMediaIndexMaintenance,
  type MediaIndexProgress,
} from "@convexpress/runtime-clients/media-index-maintenance";
const progress = v.object({
  status: v.union(
    v.literal("unconfigured"),
    v.literal("stale"),
    v.literal("building"),
    v.literal("blocked"),
    v.literal("ready"),
  ),
  generation: v.union(v.string(), v.null()),
  sequence: v.number(),
  owner: v.union(v.string(), v.null()),
  completedOwners: v.number(),
  totalOwners: v.number(),
  pages: v.number(),
  documents: v.number(),
  errorCode: v.optional(v.string()),
});
/** One authenticated, identity-bound batch. No environment writes, synthetic
 * administrators, internal site mutations, or background permission retention. */
export const maintain = action({
  args: { connectionId: v.id("overseer_connections"), expectedDeploymentOrigin: v.string() },
  returns: progress,
  handler: async (ctx, args): Promise<MediaIndexProgress> => {
    const request = {
      connectionId: args.connectionId,
      requestedCapabilities: ["session.exchange", "site.deploy"],
      requestedSiteRole: "administrator" as const,
    };
    const target = await ctx.runQuery(internal.siteBroker.internal.prepareSession, request);
    if (target.deploymentOrigin !== args.expectedDeploymentOrigin)
      throw Error("Media maintenance target changed; refresh the environment before retrying.");
    const session = await ctx.runAction(
      makeFunctionReference<
        "action",
        typeof request,
        {
          token: string;
          websiteKey: string;
          instanceKey: string;
          siteOrigin: string;
          siteCapabilities: string[];
          expiresAt: number;
        }
      >("siteBroker/session:exchange"),
      request,
    );
    if (
      session.websiteKey !== target.websiteKey ||
      session.instanceKey !== target.instanceKey ||
      session.siteOrigin !== target.siteOrigin ||
      !session.siteCapabilities.includes("manage_options") ||
      session.expiresAt <= Date.now()
    )
      throw Error("Media maintenance requires current scoped site administration.");
    const client = new ConvexHttpClient(target.deploymentOrigin, {
      fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(15_000) }),
    });
    client.setAuth(session.token);
    try {
      const result = await runMediaIndexMaintenance({
        read: () =>
          client.query(
            makeFunctionReference<"query", Record<string, never>, MediaIndexProgress>(
              "media/reverseBackfill:status",
            ),
            {},
          ),
        begin: () =>
          client.mutation(
            makeFunctionReference<"mutation", Record<string, never>, MediaIndexProgress>(
              "media/reverseBackfill:begin",
            ),
            {},
          ),
        step: (input) =>
          client.mutation(
            makeFunctionReference<
              "mutation",
              { generation: string; expectedSequence: number },
              MediaIndexProgress
            >("media/reverseBackfill:step"),
            input,
          ),
        active: () => session.expiresAt > Date.now() + 1000,
        onProgress: () => {},
      });
      const current = await ctx.runQuery(internal.siteBroker.internal.prepareSession, request);
      if (
        current.deploymentOrigin !== target.deploymentOrigin ||
        current.instanceKey !== target.instanceKey ||
        current.websiteKey !== target.websiteKey
      )
        throw Error("Media maintenance target changed during indexing.");
      return result;
    } finally {
      client.clearAuth();
    }
  },
});
