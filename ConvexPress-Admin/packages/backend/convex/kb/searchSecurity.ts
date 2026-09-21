import type { RegisteredQuery } from "convex/server";
import { ConvexError, v } from "convex/values";
import type { QueryCtx } from "../_generated/server";
import { internalQuery } from "../_generated/server";
import { getCurrentUser, requireCan } from "../helpers/permissions";
import { requirePluginEnabled } from "../helpers/plugins";
import { createPublicKbAccess } from "./publicAccess";
import { canonicalJson, sha256Hex } from "../canonicalDocuments/foundation/shared/fingerprints";

/** External index writes use the same authority as provider configuration. A
 * login alone is insufficient to export site content or delete search records. */
export const authorizeWrite: RegisteredQuery<"internal", Record<string, never>, null> = internalQuery({
  args: {}, returns: v.null(),
  handler: async ctx => {
    await requirePluginEnabled(ctx, "knowledgeBase");
    await requireCan(ctx, "manage_options");
    return null;
  },
});

export const authorizeSearch: RegisteredQuery<"internal", { requiresIdentity: boolean }, boolean> = internalQuery({
  args: { requiresIdentity: v.boolean() }, returns: v.boolean(),
  handler: async (ctx, { requiresIdentity }) => {
    if (requiresIdentity) {
      const user = await getCurrentUser(ctx);
      if (!user || user.status !== "active") return false;
    }
    const access = createPublicKbAccess(ctx);
    return await access.available() && await access.allowedRoute("/help/search");
  },
});

/** Include the runtime URL as well as the registered site/environment so a
 * restored database cannot reuse its donor's index on a different backend. */
export async function getMeilisearchIndex(ctx: Pick<QueryCtx, "db">): Promise<string> {
  const identity = await ctx.db.query("convexpress_siteIdentity").withIndex("by_identity_key", q => q.eq("identityKey", "site-identity")).unique();
  const cloudUrl = process.env.CONVEX_CLOUD_URL;
  if (!identity) throw new ConvexError({ code: "CONFIGURATION_ERROR", message: "Register this website before enabling external search." });
  if (!cloudUrl) throw new ConvexError({ code: "CONFIGURATION_ERROR", message: "The backend runtime URL is unavailable for the search index identity." });
  return `cp_kb_${sha256Hex(canonicalJson({ website: identity.websiteKey, environment: identity.instanceKey, deployment: identity.deploymentOrigin, runtime: new URL(cloudUrl).origin })).slice(0, 40)}`;
}
export const meilisearchIndex: RegisteredQuery<"internal", Record<string, never>, string> = internalQuery({
  args: {}, returns: v.string(), handler: getMeilisearchIndex,
});
