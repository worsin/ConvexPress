/** Transport contract for importing a document from an older ConvexPress site.
 * The source keeps that site's authoring shape; the import converts it into a
 * new canonical post or page and archives the exact request beside it. */
import { v, type Infer, type Validator } from "convex/values";
import {
  commentStatusValidator,
  legacyBlockArrayValidator,
  legacyBlockLayoutValidator,
  legacyBlockLockValidator,
  postVisibilityValidator,
} from "../schema/posts";
import type { InactiveLegacySettings } from "./foundation/migrationContracts";

/** Lifecycles a new canonical document can be created in. Pending, trashed and
 * auto-draft sources need an explicit decision by the migration tool. */
export const legacyImportStatusValidator = v.union(
  v.literal("draft"),
  v.literal("publish"),
  v.literal("future"),
  v.literal("private"),
);

export const legacyImportSourceValidator = v.object({
  contentMode: v.optional(v.union(v.literal("article"), v.literal("blocks"))),
  /** An article body: TipTap JSON, HTML or plain text. */
  content: v.optional(v.string()),
  /** The version 1 block tree of a block-mode document. */
  blocks: v.optional(legacyBlockArrayValidator),
  /** A block-mode page's sections, serialized exactly as stored. */
  pageSectionsJson: v.optional(v.string()),
  /** How the source site authored the bodies of its version 1 `core/rich-text`
   * blocks. "plain" (the default) is prose split on blank lines. "html" is for a
   * site that rendered them as HTML: they are parsed with the article importer's
   * HTML allow-list, and each list becomes its own `core/list` block. */
  richTextFormat: v.optional(v.union(v.literal("plain"), v.literal("html"))),
});

export const legacyImportArgs = {
  type: v.union(v.literal("post"), v.literal("page")),
  title: v.string(),
  /** Kept exactly: an import refuses rather than renaming a route. */
  slug: v.string(),
  status: legacyImportStatusValidator,
  visibility: v.optional(postVisibilityValidator),
  password: v.optional(v.string()),
  commentStatus: v.optional(commentStatusValidator),
  excerpt: v.optional(v.string()),
  /** The author, and the actor whose create/publish capabilities are checked. */
  authorId: v.id("users"),
  featuredImageId: v.optional(v.id("media")),
  /** The original publication time, kept on the new document. */
  publishedAt: v.optional(v.number()),
  scheduledAt: v.optional(v.number()),
  parentId: v.optional(v.id("posts")),
  menuOrder: v.optional(v.number()),
  pageTemplate: v.optional(v.string()),
  source: legacyImportSourceValidator,
  /** The caller's stable id for the source record, e.g. `site:<legacyId>`. */
  sourceRef: v.string(),
};
export const legacyImportArgsValidator = v.object(legacyImportArgs);
export type LegacyDocumentImportArgs = Infer<typeof legacyImportArgsValidator>;

const inactiveLegacySettingsValidator: Validator<InactiveLegacySettings, "required", string> = v.object({
  blockId: v.string(),
  name: v.string(),
  layout: v.optional(legacyBlockLayoutValidator),
  lock: v.optional(legacyBlockLockValidator),
});

export const legacyImportResultValidator = v.union(
  v.object({
    ok: v.literal(true),
    postId: v.id("posts"),
    created: v.literal(true),
    /** The article body was HTML or plain text rather than TipTap JSON. */
    importedContent: v.optional(v.union(v.literal("html"), v.literal("plain-text"))),
    /** Saved layout and lock settings the old renderer never applied. They stay
     * in the archived source and are not activated. */
    inactiveSettings: v.optional(v.array(inactiveLegacySettingsValidator)),
  }),
  v.object({
    ok: v.literal(true),
    postId: v.id("posts"),
    created: v.literal(false),
    /** The request differs from the one recorded when the document was created.
     * Nothing was changed either way. */
    sourceChanged: v.boolean(),
  }),
  v.object({
    ok: v.literal(false),
    code: v.literal("LEGACY_CONVERSION_REQUIRED"),
    path: v.array(v.union(v.string(), v.number())),
    message: v.string(),
  }),
);
export type LegacyDocumentImportResult = Infer<typeof legacyImportResultValidator>;
