import { insertCountedWishlist, patchCountedWishlist, deleteCountedWishlist, insertCountedWishlistItem, patchCountedWishlistItem, deleteCountedWishlistItem } from "../commerceWishlists/counts";
import { recordSyncedConsumerWrite } from "../syncedBlocks/consumerWrites";
import { insertCountedProgress, patchCountedProgress, deleteCountedProgress } from "../lms/progress/counts";
import { adjustCurriculumCounts, readCurriculumCounts, CURRICULUM_COUNT_FIELDS } from "../lms/curriculumCounts";
import { syncCourseCatalog, COURSE_CATALOG_FIELDS } from "../lms/courseCatalog";
import { recordCatalogWrite, CATALOG_SOURCE_FIELDS, CATALOG_POLICY_FIELDS, type CatalogSourceTable, type CatalogPolicyTable } from "../commerce/catalogRevision";
import {reconcileProductSaleWrite, PRODUCT_SALE_FIELDS, VARIANT_SALE_FIELDS} from "../commerce/productSaleIndex";
import {insertCountedReview, patchCountedReview, deleteCountedReview} from "../commerceReviews/ratingIndex";
import { syncProductDiscovery, PRODUCT_DISCOVERY_FIELDS } from "../commerce/productDiscovery";
import { adjustFormSubmissionCount, patchCountedFormSubmission, deleteCountedFormSubmission } from "../helpers/formSubmissionCounts";
import { adjustTermCount } from "../helpers/termCounts";
import { syncPostDiscovery, refreshTermDiscovery, deleteTermRelationship, POST_DISCOVERY_FIELDS } from "../helpers/postDiscovery";
import type { RequestReadLedger } from "../helpers/requestReadLedger";
import { adjustAuthorPostCounts, initializeAuthorPostCount, removeAuthorPostCount, type AuthorCountUpdate } from "../helpers/authorPostCounts";
import type { typedMediaReferences, opaqueMediaReferences } from "./referenceInventory.generated";
type ReferenceTable = keyof typeof typedMediaReferences | keyof typeof opaqueMediaReferences | CatalogPolicyTable;
import { assertAuthoringWrite, authoringWriteNeedsPrevious, type CanonicalAuthoringWritePermit } from "../helpers/authoringVersionFence";
import { reconcileOwnerReferences } from "./reverseIndex";
/** Same-transaction foreign-reference validation. Maintains reverse edges when the deployment index epoch is configured. */
import { ConvexError, getDocumentSize } from "convex/values";
import type { WithoutSystemFields } from "convex/server";
import type { Doc, Id, TableNames } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { inventory, referenceTables } from "./referenceScan";
import { collectMediaReferenceCandidates } from "./referenceExtraction";
import { opaqueMediaContainers } from "./referencePolicy";
export async function requireAttachableMedia(ctx: Pick<QueryCtx, "db">, id: Id<"media">, ledger?: RequestReadLedger) {
  ledger?.beforeRead();
  const media = await ctx.db.get("media", id);
  ledger?.record(media);
  if (!media || (media.status !== "active" && media.status !== "processing")) throw new ConvexError({ code: "MEDIA_UNAVAILABLE", message: "A selected media item is missing or unavailable. Choose an available item before saving." });
  return media;
}
export async function assertMediaAttachments(ctx: Pick<QueryCtx, "db">, table: string, candidate: Record<string, unknown>, ledger?: RequestReadLedger, requiredMediaIds?: readonly string[]) {
  const references = collectMediaReferenceCandidates(ctx, table, candidate, requiredMediaIds);
  let readBytes = 0;
  for (const reference of references) {
    ledger?.beforeRead();
    const media = await ctx.db.get("media", reference.id);
    ledger?.record(media);
    if (!media && !reference.required) continue;
    if (!media || (media.status !== "active" && media.status !== "processing")) throw new ConvexError({ code: "MEDIA_UNAVAILABLE", message: "A selected media item is missing or unavailable. Choose an available item before saving." });
    readBytes += getDocumentSize(media);
    if (readBytes > 512 * 1024) throw new ConvexError({ code: "MEDIA_ATTACHMENT_BUDGET", message: "Selected media metadata exceeds the supported save budget." });
  }
}
/** Explicit opt-in write helpers, preserving Convex transaction semantics. No ctx proxy. */
export async function insertWithMediaReferences<Table extends ReferenceTable>(ctx: Pick<MutationCtx, "db">, table: Table, value: NoInfer<WithoutSystemFields<Doc<Table>>>, permit?: CanonicalAuthoringWritePermit, ledger?: RequestReadLedger, requiredMediaIds?: readonly string[]): Promise<Id<Table>> {
  assertAuthoringWrite({ table, operation: "insert", value: value as Record<string, unknown> }, permit);
  await assertMediaAttachments(ctx, table, value as Record<string, unknown>, ledger, requiredMediaIds);
  const id: Id<Table> = await (ctx.db as any).insert(table, value);
  await reconcileOwnerReferences(ctx, table, id, value as Record<string, unknown>, ledger);
  await reconcileCurriculumWrite(ctx, table, id, null, value as Record<string, unknown>, ledger);
  await recordCatalogWrite(ctx, table, "insert", value as Record<string, unknown>, ledger);
  await reconcileProductSaleWrite(ctx,table,id,null,value as Record<string,unknown>,ledger);
  if (table === "lms_courses") {
    await syncCourseCatalog(ctx, id as Id<"lms_courses">, value as Record<string, unknown>, ledger);
    await ctx.db.patch("lms_courses", id as Id<"lms_courses">, {catalogIndexVersion:1});
  }
  if (table === "commerce_products") {
    await syncProductDiscovery(ctx, id as Id<"commerce_products">, value as Record<string, unknown>, ledger);
    await ctx.db.patch("commerce_products", id as Id<"commerce_products">, {collectionIndexVersion:1});
  }
  if (table === "posts") {
    if ((value as Record<string, unknown>).blocksVersion === 2) await recordSyncedConsumerWrite(ctx, id as Id<"posts">, value as Record<string, unknown>, ledger);
    await applyAuthorCounts(ctx, await adjustAuthorPostCounts(ctx, null, value as Record<string, unknown>, ledger), ledger);
    await syncPostDiscovery(ctx, id as Id<"posts">, value as Record<string, unknown>, ledger, null);
  }
  if (table === "users") await applyAuthorCounts(ctx, [await initializeAuthorPostCount(ctx, id as Id<"users">)], ledger);
  return id;
}
export async function patchWithMediaReferences<Table extends ReferenceTable>(ctx: Pick<MutationCtx, "db">, table: Table, id: Id<Table>, value: NoInfer<Partial<WithoutSystemFields<Doc<Table>>>>, permit?: CanonicalAuthoringWritePermit, ledger?: RequestReadLedger): Promise<void> {
  const relevant = new Set([...(inventory[table] ?? []).map(descriptor => descriptor.path[0]), ...(opaqueMediaContainers[table] ?? [])]);
  const mediaRelevant = Object.keys(value).some(key => relevant.has(key));
  const countRelevant = table === "posts" && ["type", "status", "authorId"].some(key => Object.prototype.hasOwnProperty.call(value, key));
  const discoveryRelevant = table === "posts" && POST_DISCOVERY_FIELDS.some(key => Object.prototype.hasOwnProperty.call(value, key));
  const productDiscoveryRelevant = table === "commerce_products" && PRODUCT_DISCOVERY_FIELDS.some(key => Object.prototype.hasOwnProperty.call(value, key));
  const saleRelevant = (table === "commerce_products" ? PRODUCT_SALE_FIELDS : table === "commerce_product_variants" ? VARIANT_SALE_FIELDS : []).some(key=>Object.prototype.hasOwnProperty.call(value,key));
  const courseCatalogRelevant = table === "lms_courses" && COURSE_CATALOG_FIELDS.some(key => Object.prototype.hasOwnProperty.call(value, key));
  const curriculumRelevant = table === "lms_nodes" && CURRICULUM_COUNT_FIELDS.some(key => Object.prototype.hasOwnProperty.call(value, key));
  const needsPrevious = curriculumRelevant || courseCatalogRelevant || saleRelevant || mediaRelevant || countRelevant || discoveryRelevant || productDiscoveryRelevant || authoringWriteNeedsPrevious(table, "patch", value);
  if (needsPrevious) ledger?.beforeRead();
  const existing = needsPrevious ? await ctx.db.get(table, id) : null;
  if (needsPrevious) ledger?.record(existing);
  assertAuthoringWrite({ table, operation: "patch", id, previous: existing, value }, permit);
  if (mediaRelevant && !existing) throw new ConvexError({ code: "NOT_FOUND", message: "Document not found." });
  if (mediaRelevant) await assertMediaAttachments(ctx, table, { ...existing, ...value }, ledger);
  await (ctx.db as any).patch(table, id, value);
  if (table === "posts" && (Object.prototype.hasOwnProperty.call(value, "blocks") || Object.prototype.hasOwnProperty.call(value, "blocksVersion")))
    await recordSyncedConsumerWrite(ctx, id as Id<"posts">, { ...existing, ...value }, ledger);
  if (curriculumRelevant || table === "lms_courses") await reconcileCurriculumWrite(ctx, table, id, existing, { ...existing, ...value }, ledger);
  await recordCatalogWrite(ctx, table, "patch", value as Record<string, unknown>, ledger);
  if(saleRelevant)await reconcileProductSaleWrite(ctx,table,id,existing,{...existing,...value},ledger);
  if (mediaRelevant) await reconcileOwnerReferences(ctx, table, id, { ...existing, ...value }, ledger);
  if (countRelevant) await applyAuthorCounts(ctx, await adjustAuthorPostCounts(ctx, existing, { ...existing, ...value }, ledger), ledger);
  if (discoveryRelevant) await syncPostDiscovery(ctx, id as Id<"posts">, { ...existing, ...value }, ledger, existing);
  if (courseCatalogRelevant) {
    await syncCourseCatalog(ctx, id as Id<"lms_courses">, { ...existing, ...value }, ledger);
    await ctx.db.patch("lms_courses", id as Id<"lms_courses">, {catalogIndexVersion:1});
  }
  if (productDiscoveryRelevant) {
    await syncProductDiscovery(ctx, id as Id<"commerce_products">, { ...existing, ...value }, ledger);
    await ctx.db.patch("commerce_products", id as Id<"commerce_products">, {collectionIndexVersion:1});
  }
}
export async function replaceWithMediaReferences<Table extends ReferenceTable>(ctx: Pick<MutationCtx, "db">, table: Table, id: Id<Table>, value: NoInfer<WithoutSystemFields<Doc<Table>>>, permit?: CanonicalAuthoringWritePermit, ledger?: RequestReadLedger): Promise<void> {
  const needsPrevious = table === "lms_nodes" || table === "posts" || table === "commerce_product_variants" || authoringWriteNeedsPrevious(table, "replace", value as Record<string, unknown>);
  if (needsPrevious) ledger?.beforeRead();
  const previous = needsPrevious ? await ctx.db.get(table, id) : null;
  if (needsPrevious) ledger?.record(previous);
  assertAuthoringWrite({ table, operation: "replace", id, previous, value: value as Record<string, unknown> }, permit);
  await assertMediaAttachments(ctx, table, value as Record<string, unknown>, ledger);
  await (ctx.db as any).replace(table, id, value);
  await reconcileCurriculumWrite(ctx, table, id, previous, value as Record<string, unknown>, ledger);
  await recordCatalogWrite(ctx, table, "replace", value as Record<string, unknown>, ledger);
  await reconcileProductSaleWrite(ctx,table,id,previous,value as Record<string,unknown>,ledger);
  await reconcileOwnerReferences(ctx, table, id, value as Record<string, unknown>, ledger);
  if (table === "lms_courses") {
    await syncCourseCatalog(ctx, id as Id<"lms_courses">, value as Record<string, unknown>, ledger);
    await ctx.db.patch("lms_courses", id as Id<"lms_courses">, {catalogIndexVersion:1});
  }
  if (table === "commerce_products") {
    await syncProductDiscovery(ctx, id as Id<"commerce_products">, value as Record<string, unknown>, ledger);
    await ctx.db.patch("commerce_products", id as Id<"commerce_products">, {collectionIndexVersion:1});
  }
  if (table === "posts") {
    await recordSyncedConsumerWrite(ctx, id as Id<"posts">, value as Record<string, unknown>, ledger);
    await applyAuthorCounts(ctx, await adjustAuthorPostCounts(ctx, previous, value as Record<string, unknown>, ledger), ledger);
    await syncPostDiscovery(ctx, id as Id<"posts">, value as Record<string, unknown>, ledger, previous);
  }
}

export async function deleteWithMediaReferences<Table extends ReferenceTable>(ctx: Pick<MutationCtx, "db">, table: Table, id: Id<Table>, ledger?: RequestReadLedger): Promise<void> {
  const needsPrevious=table === "lms_nodes" || table === "posts" || table === "commerce_product_variants";
  if(needsPrevious)ledger?.beforeRead();
  const previous=needsPrevious?await ctx.db.get(table,id):null;
  if(needsPrevious)ledger?.record(previous);
  await reconcileOwnerReferences(ctx, table, id, null, ledger);
  await ctx.db.delete(id);
  await reconcileCurriculumWrite(ctx, table, id, previous, null, ledger);
  await recordCatalogWrite(ctx, table, "delete", {}, ledger);
  await reconcileProductSaleWrite(ctx,table,id,previous,null,ledger);
  if (table === "lms_courses") await syncCourseCatalog(ctx, id as Id<"lms_courses">, null, ledger);
  if (table === "commerce_products") await syncProductDiscovery(ctx, id as Id<"commerce_products">, null, ledger);
  if (table === "posts") {
    await recordSyncedConsumerWrite(ctx, id as Id<"posts">, null, ledger);
    await applyAuthorCounts(ctx, await adjustAuthorPostCounts(ctx, previous, null, ledger), ledger);
    await syncPostDiscovery(ctx, id as Id<"posts">, null, ledger, previous);
  }
  if (table === "users") await removeAuthorPostCount(ctx, id as Id<"users">);
}

async function applyAuthorCounts(ctx: Pick<MutationCtx, "db">, updates: AuthorCountUpdate[], ledger?: RequestReadLedger) {
  for (const update of updates) await patchWithMediaReferences(ctx, "users", update.authorId,
    { postCount: update.count, postCountReady: update.ready }, undefined, ledger);
}

/** Explicit companion for the reviewed promotion/rollback write boundaries. */
export async function reconcilePostAuthorCounts(ctx: Pick<MutationCtx, "db">, table: string,
  previous: Record<string, unknown> | null, next: Record<string, unknown> | null) {
  if (table === "posts") await applyAuthorCounts(ctx, await adjustAuthorPostCounts(ctx, previous, next));
}

/** Legacy dynamic IDs are classified by Convex table identity, never by field names
 * or an untrusted table hint. normalizeId performs no database scan. */
function referenceOwner(ctx: Pick<MutationCtx, "db">, id: string): { table: ReferenceTable; id: Id<ReferenceTable> } | null {
  for (const owner of new Set([...referenceTables, ...Object.keys(CATALOG_POLICY_FIELDS)])) {
    const table = owner as ReferenceTable;
    const normalized = ctx.db.normalizeId(table, id);
    if (normalized) return { table, id: normalized };
  }
  return null;
}
export async function patchDynamicWithMediaReferences(ctx: Pick<MutationCtx, "db">, id: string, value: Record<string, unknown>, permit?: CanonicalAuthoringWritePermit, ledger?: RequestReadLedger): Promise<void> {
  const owner = referenceOwner(ctx, id);
  if (owner) return patchWithMediaReferences<ReferenceTable>(ctx, owner.table, owner.id, value, permit, ledger);
  const wishlist = ctx.db.normalizeId("commerce_wishlists", id);
  if (wishlist) return patchCountedWishlist(ctx, wishlist, value);
  const wishlistItem = ctx.db.normalizeId("commerce_wishlist_items", id);
  if (wishlistItem) return patchCountedWishlistItem(ctx, wishlistItem, value);
  const progress = ctx.db.normalizeId("lms_progress", id);
  if (progress) return patchCountedProgress(ctx, progress, value);
  const review = ctx.db.normalizeId("commerce_review_items", id);
  if (review) return patchCountedReview(ctx, review, value);
  const submission = ctx.db.normalizeId("form_submissions", id);
  if (submission) return patchCountedFormSubmission(ctx, submission, value);
  // Nonowner/invalid IDs retain the framework's ordinary schema/existence checks.
  const relation = ctx.db.normalizeId("termRelationships", id);
  if (relation) ledger?.beforeRead();
  const previous = relation ? await ctx.db.get("termRelationships", relation) : null;
  if (relation) ledger?.record(previous);
  await ctx.db.patch(id as Id<TableNames>, value);
  for (const table of Object.keys(CATALOG_SOURCE_FIELDS) as CatalogSourceTable[]) if (ctx.db.normalizeId(table, id)) await recordCatalogWrite(ctx, table, "patch", value, ledger);
  if (relation) await refreshTermDiscovery(ctx, relation, ledger, previous);
  const term = ctx.db.normalizeId("terms", id);
  if (term) await adjustTermCount(ctx, term, null, ledger);
}
export async function deleteDynamicWithMediaReferences(ctx: Pick<MutationCtx, "db">, id: string, ledger?: RequestReadLedger): Promise<void> {
  const owner = referenceOwner(ctx, id);
  if (owner) return deleteWithMediaReferences<ReferenceTable>(ctx, owner.table, owner.id, ledger);
  const wishlist = ctx.db.normalizeId("commerce_wishlists", id);
  if (wishlist) return deleteCountedWishlist(ctx, wishlist);
  const wishlistItem = ctx.db.normalizeId("commerce_wishlist_items", id);
  if (wishlistItem) return deleteCountedWishlistItem(ctx, wishlistItem);
  const progress = ctx.db.normalizeId("lms_progress", id);
  if (progress) return deleteCountedProgress(ctx, progress);
  const review = ctx.db.normalizeId("commerce_review_items", id);
  if (review) return deleteCountedReview(ctx, review);
  const submission = ctx.db.normalizeId("form_submissions", id);
  if (submission) return deleteCountedFormSubmission(ctx, submission);
  const relation = ctx.db.normalizeId("termRelationships", id);
  if (relation) return deleteTermRelationship(ctx, relation, ledger);
  await ctx.db.delete(id as Id<TableNames>);
  for (const table of Object.keys(CATALOG_SOURCE_FIELDS) as CatalogSourceTable[]) if (ctx.db.normalizeId(table, id)) await recordCatalogWrite(ctx, table, "delete", {}, ledger);
}

/** Schema-validated dynamic adapters still enforce the same attachment and authoring rules. */
export async function insertDynamicWithMediaReferences(ctx: Pick<MutationCtx, "db">, table: string, value: Record<string, unknown>, permit?: CanonicalAuthoringWritePermit, ledger?: RequestReadLedger): Promise<string> {
  assertAuthoringWrite({ table, operation: "insert", value }, permit);
  await assertMediaAttachments(ctx, table, value, ledger);
  if (table === "commerce_wishlists") return insertCountedWishlist(ctx, value as WithoutSystemFields<Doc<"commerce_wishlists">>);
  if (table === "commerce_wishlist_items") return insertCountedWishlistItem(ctx, value as WithoutSystemFields<Doc<"commerce_wishlist_items">>);
  if (table === "lms_progress") return insertCountedProgress(ctx, value as WithoutSystemFields<Doc<"lms_progress">>);
  if (table === "commerce_review_items") return insertCountedReview(ctx, value as WithoutSystemFields<Doc<"commerce_review_items">>);
  const id: string = await (ctx.db as any).insert(table, value);
  await reconcileCurriculumWrite(ctx, table, id, null, value, ledger);
  await recordCatalogWrite(ctx, table, "insert", value, ledger);
  await reconcileProductSaleWrite(ctx,table,id,null,value,ledger);
  await reconcileOwnerReferences(ctx, table, id, value, ledger);
  if (table === "lms_courses") {
    await syncCourseCatalog(ctx, id as Id<"lms_courses">, value as Record<string, unknown>, ledger);
    await ctx.db.patch("lms_courses", id as Id<"lms_courses">, {catalogIndexVersion:1});
  }
  if (table === "commerce_products") {
    await syncProductDiscovery(ctx, id as Id<"commerce_products">, value, ledger);
    await ctx.db.patch("commerce_products", id as Id<"commerce_products">, {collectionIndexVersion:1});
  }
  if (table === "posts") {
    await applyAuthorCounts(ctx, await adjustAuthorPostCounts(ctx, null, value, ledger), ledger);
    await syncPostDiscovery(ctx, id as Id<"posts">, value as Record<string, unknown>, ledger, null);
  }
  if (table === "form_submissions") await adjustFormSubmissionCount(ctx, null, await ctx.db.get("form_submissions", id as Id<"form_submissions">));
  if (table === "termRelationships") await refreshTermDiscovery(ctx, id as Id<"termRelationships">, ledger);
  if (table === "terms") await adjustTermCount(ctx, id as Id<"terms">, null, ledger);
  if (table === "users") await applyAuthorCounts(ctx, [await initializeAuthorPostCount(ctx, id as Id<"users">)], ledger);
  return id;
}

/** Shared with promotion and rollback so imports cannot copy derived counts or
 * count-version markers without applying this installation's contribution. */
export async function reconcileCurriculumWrite(ctx: Pick<MutationCtx, "db">, table: string, id: string,
  previous: Record<string, unknown> | null, next: Record<string, unknown> | null, ledger?: RequestReadLedger) {
  if (table !== "lms_nodes" && table !== "lms_courses") return;
  const courses = table === "lms_nodes" ? await adjustCurriculumCounts(ctx, previous, next, ledger) : [id as Id<"lms_courses">];
  if (table === "lms_nodes" && next) await ctx.db.patch("lms_nodes", id as Id<"lms_nodes">, { curriculumCountVersion: 1 });
  for (const courseId of courses) {
    ledger?.beforeRead();
    const course = await ctx.db.get("lms_courses", courseId);
    ledger?.record(course);
    if (!course) continue;
    const counts = await readCurriculumCounts(ctx, courseId, ledger);
    if (counts.state === "ready" && (course.lessonCount !== counts.lessons || course.topicCount !== counts.topics))
      await ctx.db.patch("lms_courses", courseId, { lessonCount: counts.lessons, topicCount: counts.topics });
  }
}
