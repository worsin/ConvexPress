import { ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { RequestReadLedger } from "../helpers/requestReadLedger";

/** Coordinates that can change category selection or product eligibility.
 * Stock/price-only writes do not change counts. Policy changes have a separate
 * revision domain; neither revision by itself authorizes a visitor. */
export const CATALOG_SOURCE_FIELDS = {
  commerce_products: ["status", "slug", "productType", "categoryIds", "brandId", "publishedAt", "createdAt", "title", "sku", "excerpt", "description"],
  commerce_product_brands: ["name", "slug", "status", "sortOrder"],
  commerce_product_categories: ["name", "slug", "parentId", "isVisible", "sortOrder"],
  commerce_product_variants: ["productId", "status", "isDefault"],
  commerce_bundles: ["productId"],
} as const;
export type CatalogSourceTable = keyof typeof CATALOG_SOURCE_FIELDS;
export const CATALOG_POLICY_FIELDS = {
  users: ["authSource", "clerkUserId", "roleId", "internalRole", "status"],
  roles: ["slug", "status", "type", "level", "capabilities"],
  membership_plans: ["status", "linkedRoleId", "linkedCapabilities"],
  membership_grants: ["userId", "planId", "status", "startsAt", "endsAt", "graceEndsAt", "revokedAt"],
  membership_restriction_rules: null,
  settings: null,
} as const;
export type CatalogPolicyTable = keyof typeof CATALOG_POLICY_FIELDS;
export type CatalogRevisionDomain = "source" | "policy";
type WriteOperation = "insert" | "patch" | "replace" | "delete";
type RevisionCtx = Pick<MutationCtx, "db">;

export function changesCatalogSource(table: string, operation: WriteOperation, value: Record<string, unknown> = {}): boolean {
  if (!Object.prototype.hasOwnProperty.call(CATALOG_SOURCE_FIELDS, table)) return false;
  if (operation !== "patch") return true;
  return CATALOG_SOURCE_FIELDS[table as CatalogSourceTable].some(field => Object.prototype.hasOwnProperty.call(value, field));
}

export function changesCatalogPolicy(table: string, operation: WriteOperation, value: Record<string, unknown> = {}): boolean {
  if (!Object.prototype.hasOwnProperty.call(CATALOG_POLICY_FIELDS, table)) return false;
  if (operation !== "patch") return true;
  const fields = CATALOG_POLICY_FIELDS[table as CatalogPolicyTable];
  return fields === null || fields.some(field => Object.prototype.hasOwnProperty.call(value, field));
}

/** The row identity prevents an absent/recreated counter from matching an old
 * continuation. Bumps commit or roll back with the originating source write. */
export async function recordCatalogWrite(ctx: RevisionCtx, table: string, operation: WriteOperation,
  value: Record<string, unknown> = {}, budget?: RequestReadLedger): Promise<void> {
  const domain = changesCatalogSource(table, operation, value) ? "source" : changesCatalogPolicy(table, operation, value) ? "policy" : null;
  if (!domain) return;
  budget?.beforeRead();
  const current = await ctx.db.query("commerce_catalog_revisions").withIndex("by_domain", q => q.eq("domain", domain)).unique();
  budget?.record(current);
  if (!current) {
    await ctx.db.insert("commerce_catalog_revisions", {domain, revision: 1});
    return;
  }
  if (!Number.isSafeInteger(current.revision) || current.revision < 1 || current.revision >= Number.MAX_SAFE_INTEGER)
    throw new ConvexError({code: "CATALOG_REVISION_INVALID", message: "Catalog revision needs repair before changing its sources."});
  await ctx.db.patch("commerce_catalog_revisions", current._id, {revision: current.revision + 1});
}

/** This source stamp is a prerequisite for stable multi-request counts. A full
 * count binding must also include scope, viewer, policy and time boundaries. */
export async function readCatalogRevision(ctx: Pick<QueryCtx, "db">, domain: CatalogRevisionDomain, budget?: RequestReadLedger) {
  budget?.beforeRead();
  const row = await ctx.db.query("commerce_catalog_revisions").withIndex("by_domain", q => q.eq("domain", domain)).unique();
  budget?.record(row);
  if (row && (!Number.isSafeInteger(row.revision) || row.revision < 1))
    throw new ConvexError({code: "CATALOG_REVISION_INVALID", message: "Catalog revision cannot be verified."});
  return row ? {id: String(row._id), revision: row.revision} : null;
}
