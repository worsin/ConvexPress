import { ConvexError } from "convex/values";
import type { Id } from "../../_generated/dataModel";
import type { QueryCtx } from "../../_generated/server";
import { RequestReadLedger } from "../../helpers/requestReadLedger";

export function assertCategoryNotDeleting(category: object): void {
  if ("deletionJobId" in category && category.deletionJobId) throw new ConvexError({ code: "CATEGORY_DELETING", message: "This category is being deleted. Wait for deletion to finish or choose another category." });
}

export async function requireAssignableCategory(ctx: Pick<QueryCtx, "db">, id: Id<"kb_categories">, budget?: RequestReadLedger): Promise<void> {
  budget?.beforeRead();
  const category = await ctx.db.get("kb_categories", id); budget?.record(category);
  if (!category) throw new ConvexError({ code: "NOT_FOUND", message: "Category not found." });
  assertCategoryNotDeleting(category);
  if (!category.isActive) throw new ConvexError({ code: "VALIDATION_ERROR", message: "An inactive category cannot receive content." });
}

export const MAX_CATEGORY_ANCESTORS = 64;

/** Validate the complete proposed ancestor chain in the same write transaction.
 * A visited set also catches pre-existing cycles that do not include the child. */
export async function validateCategoryParent(
  ctx: Pick<QueryCtx, "db">,
  parentId: Id<"kb_categories"> | null | undefined,
  categoryId?: Id<"kb_categories">,
): Promise<void> {
  const seen = new Set<Id<"kb_categories">>(categoryId ? [categoryId] : []);
  const budget = new RequestReadLedger({ queries: 64, documents: 64, bytes: 2 * 1024 * 1024, documentBytes: 512 * 1024 });
  let current = parentId;
  for (let depth = 0; current; depth++) {
    if (seen.has(current)) throw new ConvexError({ code: "VALIDATION_ERROR", message: "Category parent cycle detected. Choose a different parent or No parent." });
    if (depth >= MAX_CATEGORY_ANCESTORS) throw new ConvexError({ code: "VALIDATION_ERROR", message: "Category hierarchy exceeds the maximum of 64 ancestors." });
    seen.add(current);
    budget.beforeRead();
    const parent = budget.record(await ctx.db.get("kb_categories", current));
    if (!parent) throw new ConvexError({ code: "NOT_FOUND", message: "Parent category not found." });
    assertCategoryNotDeleting(parent);
    if (!parent.isActive) throw new ConvexError({ code: "VALIDATION_ERROR", message: "An inactive category cannot be a parent." });
    current = parent.parentId;
  }
}

export function validateCategoryFields(fields: { name?: string; description?: string; icon?: string }): void {
  for (const [key, maximum] of [["name", 256], ["description", 100000], ["icon", 500]] as const) {
    const value = fields[key];
    if (value !== undefined && value.length > maximum) throw new ConvexError({ code: "VALIDATION_ERROR", message: `Category ${key} exceeds the maximum of ${maximum} characters.` });
  }
}
