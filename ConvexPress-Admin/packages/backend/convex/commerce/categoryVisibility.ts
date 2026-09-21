import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

type Category = Doc<"commerce_product_categories">;
/** Request-local hierarchy check. Persisted path/depth are not access authority. */
export function createCategoryVisibilityReader(ctx: Pick<QueryCtx, "db">, seed: readonly Category[] = [], readParent: (id: Id<"commerce_product_categories">) => Promise<Category | null> = id => ctx.db.get("commerce_product_categories", id)) {
  const rows = new Map<Id<"commerce_product_categories">, Category | null>(seed.map(row => [row._id, row]));
  return async (category: Category): Promise<Category[] | null> => {
    const ancestors: Category[] = [], seen = new Set<string>();
    let current: Category | null = category;
    while (current) {
      if (current.isVisible === false || seen.has(current._id) || seen.size >= 32) return null;
      seen.add(current._id);
      if (current._id !== category._id) ancestors.unshift(current);
      if (!current.parentId) return ancestors;
      const parentId = current.parentId;
      if (!rows.has(parentId)) rows.set(parentId, await readParent(parentId));
      current = rows.get(parentId) ?? null;
    }
    // Missing parents cannot turn an orphaned category into a public root.
    return null;
  };
}

export async function filterPublicCategoryHierarchy(ctx: Pick<QueryCtx, "db">, categories: readonly Category[]): Promise<Category[]> {
  const read = createCategoryVisibilityReader(ctx, categories), visible: Category[] = [];
  for (const category of categories) if (await read(category)) visible.push(category);
  return visible;
}
