import type { Doc } from "../_generated/dataModel";

// Publishing status, ownership, passwords and URLs are deliberately not revisioned.
import { AUTHORING_FIELDS, type AuthoringField } from "./authoringFields";
export { AUTHORING_FIELDS, type AuthoringField } from "./authoringFields";
export type AuthoringSnapshot = Pick<Doc<"revisions">, AuthoringField>;
/** Archived/imported sources may retain retired fields; current live posts do not. */
export type HistoricalAuthoringSource = Doc<"posts"> & Partial<Pick<Doc<"revisions">, "content" | "contentMode" | "pageSections">>;

export function authoringSnapshot(post: HistoricalAuthoringSource): AuthoringSnapshot {
  const snapshot = Object.fromEntries(AUTHORING_FIELDS.map((field: AuthoringField) => [field, post[field]]));
  return { ...snapshot, title: post.title, content: post.content ?? "" } as AuthoringSnapshot;
}

export function restoredAuthoring(revision: Doc<"revisions">): AuthoringSnapshot {
  // Earlier block saves serialized the tree into content and marked "blocks"
  // changed. Recover only that known format; ordinary JSON articles stay text.
  if (revision.snapshotVersion === undefined && revision.changedFields.includes("blocks")) {
    try {
      const blocks: unknown = JSON.parse(revision.content);
      if (isLegacyBlockTree(blocks)) {
        return { title: revision.title, content: "", excerpt: revision.excerpt,
          contentMode: "blocks", blocks, blocksVersion: 1, composedDefinitions: undefined };
      }
    } catch { /* Plain legacy content is restored below. */ }
  }
  // Old revisions contain no block/structured snapshot. Restore them as legacy
  // articles rather than rendering unrelated current blocks over restored text.
  const snapshot = Object.fromEntries(AUTHORING_FIELDS
    .filter(field => revision.snapshotVersion === 2 || !["layoutId", "pagePrompt"].includes(field))
    .map((field: AuthoringField) => [field, revision[field]]));
  return {
    ...snapshot,
    title: revision.title,
    content: revision.content,
    contentMode: revision.blocksVersion === 2 ? revision.contentMode : revision.contentMode ?? "article",
  } as AuthoringSnapshot;
}

function isLegacyBlockTree(value: unknown, depth = 0): value is NonNullable<AuthoringSnapshot["blocks"]> {
  return depth <= 4 && Array.isArray(value) && value.length <= 200 && value.every((block) =>
    block !== null && typeof block === "object" &&
    typeof block.id === "string" && block.id.length > 0 && block.id.length <= 80 &&
    typeof block.name === "string" && block.name.length > 0 && block.name.length <= 120 &&
    typeof block.version === "number" && Number.isFinite(block.version) &&
    block.attrs !== null && typeof block.attrs === "object" && !Array.isArray(block.attrs) &&
    (block.innerBlocks === undefined || isLegacyBlockTree(block.innerBlocks, depth + 1)));
}

/** Stable comparison text for fields beyond the legacy article editor. */
export function authoringDetails(revision: Doc<"revisions">): string {
  return JSON.stringify(Object.fromEntries(AUTHORING_FIELDS
    .filter((field) => !["title", "content", "excerpt", "blocksRevision"].includes(field))
    .map((field) => [field, revision[field]])), null, 2);
}

/** Copy an archived authoring snapshot into current storage without legacy columns. */
export function liveAuthoringSnapshot(snapshot: AuthoringSnapshot) {
  const {content, contentMode, pageSections, ...current} = snapshot;
  return current;
}

/** Only transitional records can own these keys. Do not send unknown patch keys
 * to the contracted schema when restoring an archive onto a current document. */
export function retiredLiveFieldPatch(source: HistoricalAuthoringSource) {
  const patch: {content?: undefined; contentMode?: undefined; pageSections?: undefined} = {};
  for (const key of ["content", "contentMode", "pageSections"] as const) {
    if (Object.prototype.hasOwnProperty.call(source, key)) patch[key] = undefined;
  }
  return patch;
}
