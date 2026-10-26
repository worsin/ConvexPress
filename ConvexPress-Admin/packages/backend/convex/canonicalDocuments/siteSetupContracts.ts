/** Transport contract for a host application's site setup: the pages a site
 * ships with, written as canonical documents. Setup runs again on every deploy;
 * a receipt per document keeps it from overwriting what an editor changed. */
import { v, type Infer } from "convex/values";
import { canonicalBlocksTransportValidator } from "./apiValidators";

export const siteSetupDocumentArgs = {
  type: v.union(v.literal("post"), v.literal("page")),
  /** The host's stable name for this document across runs, e.g. `casemedix:pricing`. */
  setupKey: v.string(),
  title: v.string(),
  slug: v.string(),
  status: v.union(v.literal("draft"), v.literal("publish")),
  /** The author, and the actor whose create, update and publish capabilities are checked. */
  authorId: v.id("users"),
  excerpt: v.optional(v.string()),
  pageTemplate: v.optional(v.string()),
  blocks: canonicalBlocksTransportValidator,
  /** Take over a document already at this slug that nobody has edited since it
   * was created (an imported page): its content becomes a revision. */
  adoptUnedited: v.optional(v.boolean()),
};
export const siteSetupDocumentArgsValidator = v.object(siteSetupDocumentArgs);
export type SiteSetupDocumentArgs = Infer<typeof siteSetupDocumentArgsValidator>;

export const siteSetupOutcomeValidator = v.union(
  v.literal("created"),
  /** Setup's own document, unedited since setup last wrote it, now has the new content. */
  v.literal("updated"),
  v.literal("unchanged"),
  /** An unedited document already at the slug now carries setup's content. */
  v.literal("adopted"),
  /** An editor changed setup's document; it is left as they made it. */
  v.literal("kept_edited"),
  /** An editor removed setup's document; setup does not bring it back. */
  v.literal("kept_removed"),
  /** Another document holds the slug and was not adopted. */
  v.literal("slug_taken"),
);
export const siteSetupDocumentResultValidator = v.object({
  outcome: siteSetupOutcomeValidator,
  postId: v.union(v.id("posts"), v.null()),
});
export type SiteSetupDocumentResult = Infer<typeof siteSetupDocumentResultValidator>;
