import { promotionReviewedRecordSchema } from "../../../../../packages/site-contract/src/content-promotion";
import type { api } from "@control/convex/_generated/api";
import type { FunctionArgs, FunctionReturnType } from "convex/server";

export type Review = FunctionReturnType<typeof api.contentPromotion.records.get>;
export type Selection = FunctionArgs<typeof api.contentPromotion.review.preview>["selection"];
export const CONTENT_KINDS = {
  pageIds: "Pages", postIds: "Posts", menuIds: "Menus", mediaIds: "Media", eventIds: "Events",
  productIds: "Products", productCategoryIds: "Product categories", courseIds: "Courses", planIds: "Active membership plans",
} as const;
export type ContentKind = keyof typeof CONTENT_KINDS;
export type Candidate = { id: string; title: string; detail: string };
export const emptySelection = (): Selection => ({ pageIds: [], postIds: [], menuIds: [], mediaIds: [], eventIds: [], productIds: [], productCategoryIds: [], courseIds: [], planIds: [], includePresentation: false });
export function selectionCount(selection: Selection) { return Object.keys(CONTENT_KINDS).reduce((sum, key) => sum + (selection[key as ContentKind]?.length ?? 0), 0); }
export function toggleSelection(selection: Selection, kind: ContentKind, id: string): Selection {
  const current = selection[kind] ?? [];
  if (current.includes(id)) return { ...selection, [kind]: current.filter(value => value !== id) };
  if (selectionCount(selection) >= 100) throw new Error("Choose at most 100 items per review.");
  return { ...selection, [kind]: [...current, id] };
}
/** Only display authored identifiers and titles from the authenticated list response. */
export function candidates(rows: readonly unknown[]): Candidate[] {
  const result = new Map<string, Candidate>();
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const value = row as Record<string, unknown>;
    const id = value._id ?? value.id;
    if (typeof id !== "string" || !id || ["trash", "auto-draft", "future"].includes(String(value.status))) continue;
    const title = [value.title, value.name, value.originalFilename, value.fileName, value.filename, value.slug].find(item => typeof item === "string" && item.trim());
    if (typeof title !== "string") continue;
    result.set(id, { id, title, detail: [value.slug, value.status].filter(item => typeof item === "string").join(" · ") });
  }
  return [...result.values()];
}
export function receiptStatus(review: Review, now: number) { return review.expiresAt <= now ? "expired" : review.status; }
export function receiptStorageKey(operatorId: string, websiteId: string) { return `convexpress:promotion-review:${encodeURIComponent(operatorId)}:${encodeURIComponent(websiteId)}`; }

/** Parse the bounded serialized DTO with the same authored-kind schema used by the broker. */
export function parseReviewedRecord(record: Review["authoredRecords"][number]) {
  if (typeof record.dataJson !== "string" || new TextEncoder().encode(record.dataJson).length > 500_000) return null;
  try {
    const parsed = promotionReviewedRecordSchema.safeParse({ key: record.key, kind: record.kind, sourceRevision: record.sourceRevision, data: JSON.parse(record.dataJson) });
    return parsed.success ? parsed.data : null;
  } catch { return null; }
}
