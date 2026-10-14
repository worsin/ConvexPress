import { ConvexError } from "convex/values";
import type { TableNames } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { RequestReadLedger } from "../helpers/requestReadLedger";

/** Coordinates that can change category selection or product eligibility.
 * Stock/price-only writes do not change counts. Policy changes have a separate
 * revision domain; neither revision by itself authorizes a visitor. */
export const CATALOG_SOURCE_TABLES = ["commerce_products", "commerce_product_brands", "commerce_product_categories", "commerce_product_variants", "commerce_bundles"] as const satisfies readonly TableNames[];
export type CatalogSourceTable = (typeof CATALOG_SOURCE_TABLES)[number];
export const CATALOG_SOURCE_FIELDS: Readonly<Record<CatalogSourceTable, readonly string[]>> = {
  commerce_products: ["status", "slug", "productType", "categoryIds", "brandId", "publishedAt", "createdAt", "title", "sku", "excerpt", "description"],
  commerce_product_brands: ["name", "slug", "status", "sortOrder"],
  commerce_product_categories: ["name", "slug", "parentId", "isVisible", "sortOrder"],
  commerce_product_variants: ["productId", "status", "isDefault"],
  commerce_bundles: ["productId"],
};
export const CATALOG_POLICY_TABLES = ["users", "roles", "membership_plans", "membership_grants", "membership_restriction_rules", "settings"] as const satisfies readonly TableNames[];
export type CatalogPolicyTable = (typeof CATALOG_POLICY_TABLES)[number];
/** null: every write to the table changes policy. */
export const CATALOG_POLICY_FIELDS: Readonly<Record<CatalogPolicyTable, readonly string[] | null>> = {
  users: ["authSource", "clerkUserId", "roleId", "internalRole", "status"],
  roles: ["slug", "status", "type", "level", "capabilities"],
  membership_plans: ["status", "linkedRoleId", "linkedCapabilities"],
  membership_grants: ["userId", "planId", "status", "startsAt", "endsAt", "graceEndsAt", "revokedAt"],
  membership_restriction_rules: null,
  settings: null,
};
export type CatalogRevisionDomain = "source" | "policy";
type WriteOperation = "insert" | "patch" | "replace" | "delete";
type RevisionCtx = Pick<MutationCtx, "db">;
const sourceTables: ReadonlySet<TableNames> = new Set(CATALOG_SOURCE_TABLES);
const policyTables: ReadonlySet<TableNames> = new Set(CATALOG_POLICY_TABLES);
function isCatalogSourceTable(table: TableNames): table is CatalogSourceTable { return sourceTables.has(table); }
function isCatalogPolicyTable(table: TableNames): table is CatalogPolicyTable { return policyTables.has(table); }

export function changesCatalogSource(table: TableNames, operation: WriteOperation, value: Record<string, unknown> = {}): boolean {
  if (!isCatalogSourceTable(table)) return false;
  if (operation !== "patch") return true;
  return CATALOG_SOURCE_FIELDS[table].some(field => Object.prototype.hasOwnProperty.call(value, field));
}

export function changesCatalogPolicy(table: TableNames, operation: WriteOperation, value: Record<string, unknown> = {}): boolean {
  if (!isCatalogPolicyTable(table)) return false;
  if (operation !== "patch") return true;
  const fields = CATALOG_POLICY_FIELDS[table];
  return fields === null || fields.some(field => Object.prototype.hasOwnProperty.call(value, field));
}

/** The row identity prevents an absent/recreated counter from matching an old
 * continuation. Bumps commit or roll back with the originating source write. */
export async function recordCatalogWrite(ctx: RevisionCtx, table: TableNames, operation: WriteOperation,
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
