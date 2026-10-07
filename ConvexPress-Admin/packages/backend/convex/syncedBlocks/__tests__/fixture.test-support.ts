import { convexTest } from "convex-test";
import { makeFunctionReference as ref } from "convex/server";
import schema from "../../schema";
import { installation, publishedReader } from "../model";
const modules = {
  "./convex/syncedBlocks/legacy.ts": () => import("../legacy"),
  "./convex/editor/mutations.ts": () => import("../../editor/mutations"),
  "./convex/search/internals.ts": () => import("../../search/internals"),
  "./convex/search/candidates.ts": () => import("../../search/candidates"),
  "./convex/syncedBlocks/picker.ts": () => import("../picker"),
  "./convex/syncedBlocks/consumerIndex.ts": () => import("../consumerIndex"),
  "./convex/syncedBlocks/refresh.ts": () => import("../refresh"),
  "./convex/media/referenceReads.ts": () => import("../../media/referenceReads"),
  "./convex/media/reverseBackfill.ts": () => import("../../media/reverseBackfill"),
  "./convex/media/mutations.ts": () => import("../../media/mutations"),
  "./convex/extensions/forms/polls.ts": () => import("../../extensions/forms/polls"),
  "./convex/syncedBlocks/editor.ts": () => import("../editor"),
  "./convex/membership/policyReads.ts": () => import("../../membership/policyReads"),
  "./convex/syncedBlocks/options.ts": () => import("../options"),
  "./convex/canonicalDocuments.ts": () => import("../../canonicalDocuments"),
  "./convex/_generated/api.js": () => import("../../_generated/api.js"),
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/syncedBlocks/content.ts": () => import("../content"),
  "./convex/syncedBlocks/queries.ts": () => import("../queries"),
};
export const create = ref<"mutation">("syncedBlocks/content:create"), save = ref<"mutation">("syncedBlocks/content:save"),
  review = ref<"query">("syncedBlocks/content:reviewPublication"), publish = ref<"mutation">("syncedBlocks/content:publish"),
  withdraw = ref<"mutation">("syncedBlocks/content:withdraw"), get = ref<"query">("syncedBlocks/content:get");
export const text = [{ id: "text", name: "core/paragraph", version: 2, attrs: {} }];
export const reference = (id: string, revision: number | "latest" = "latest") => [{ id: "reference", name: "core/synced", version: 1, attrs: { syncedBlock: id, revisionPolicy: revision === "latest" ? "latest" : "pinned", ...(revision === "latest" ? {} : { revision }) } }];
export async function fixture() {
  const t = convexTest({ schema, modules });
  const ids = await t.run(async ctx => {
    const role = await ctx.db.insert("roles", { name: "Editor", slug: "editor", description: "Test", level: 10, type: "internal", isDefault: false, isProtected: false, capabilities: ["post.create", "post.read", "post.update", "post.publish", "post.unpublish"], pageAccess: [], status: "active", createdAt: 1, updatedAt: 1 });
    const user = await ctx.db.insert("users", { authSource: "local", email: "editor@example.invalid", emailVerified: true, status: "active", roleId: role, createdAt: 1, updatedAt: 1 });
    const customer = await ctx.db.insert("users", { authSource: "clerk", clerkUserId: "synced-customer", email: "customer@example.invalid", emailVerified: true, status: "active", createdAt: 1, updatedAt: 1 });
    const site = await ctx.db.insert("convexpress_siteIdentity", { identityKey: "site-identity", websiteKey: "synced", instanceKey: "staging", environmentKind: "staging", deploymentOrigin: "https://synced.convex.cloud", managementOrigin: "https://controller.convex.cloud", siteOrigin: "https://synced.convex.site", siteContractVersion: "1", schemaVersion: "1", engineVersion: "1", managementCapabilities: [], initializedAt: 1, updatedAt: 1 });
    return { user, customer, site, role };
  });
  const operator = t.withIdentity({ subject: ids.user, tokenIdentifier: `https://convexpress-admin.local|${ids.user}` });
  const customer = t.withIdentity({ subject: "synced-customer", tokenIdentifier: "https://clerk.example|synced-customer" });
  const read = (id: string, revision: number | "latest" = "latest") => t.run(async ctx => publishedReader(ctx, await installation(ctx))(revision === "latest" ? { id, revisionPolicy: "latest" } : { id, revisionPolicy: "pinned", revision }));
  async function release(id: string, generation: number, revision: number) {
    const checked = await operator.query(review, { id, expectedGeneration: generation, revision });
    return operator.mutation(publish, { id, expectedGeneration: generation, revision, reviewDigest: checked.digest });
  }
  return { t, ids, operator, customer, read, release };
}
