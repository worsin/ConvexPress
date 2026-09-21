import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { RequestReadLedger } from "../helpers/requestReadLedger";

export const COURSE_CATALOG_FIELDS = ["status", "categoryIds", "createdAt", "catalogIndexVersion"] as const;
const MAX_CATEGORIES = 64;
const MAX_ENTRIES = MAX_CATEGORIES + 1;
type Entry = Pick<Doc<"lms_course_catalog">, "kind" | "key" | "createdAt">;

/** Category keys retain the case-insensitive matching of the existing catalog. */
export function courseCatalogEntries(course: Record<string, unknown> | null): Entry[] {
  if (!course || course.status !== "published") return [];
  if (!Number.isSafeInteger(course.createdAt) || (course.createdAt as number) < 0)
    throw new ConvexError({ code: "COURSE_CATALOG_DATE", message: "Course creation date must be a nonnegative whole timestamp." });
  const categories = course.categoryIds ?? [];
  if (!Array.isArray(categories) || categories.some(id => typeof id !== "string" || !id.trim() || id.length > 256))
    throw new ConvexError({ code: "COURSE_CATALOG_CATEGORY", message: "Course category references must be nonempty and at most 256 characters." });
  const keys = [...new Set((categories as string[]).map(id => id.trim().toLowerCase()))];
  if (keys.length > MAX_CATEGORIES)
    throw new ConvexError({ code: "COURSE_CATEGORY_LIMIT", message: "A course supports up to 64 category assignments." });
  const createdAt = course.createdAt as number;
  return [{ kind: "recent", key: "", createdAt }, ...keys.map(key => ({ kind: "category" as const, key, createdAt }))];
}

/** All coordinates are maintained in the same transaction as their source. */
export async function syncCourseCatalog(ctx: Pick<MutationCtx, "db">, courseId: Id<"lms_courses">,
  course: Record<string, unknown> | null, ledger?: RequestReadLedger): Promise<void> {
  const remaining = new Map(courseCatalogEntries(course).map(entry => [`${entry.kind}:${entry.key}`, entry]));
  ledger?.beforeRead();
  const previous = await ctx.db.query("lms_course_catalog").withIndex("by_course", q => q.eq("courseId", courseId)).take(MAX_ENTRIES + 1);
  for (const row of previous) ledger?.record(row);
  if (previous.length > MAX_ENTRIES)
    throw new ConvexError({ code: "COURSE_CATALOG_LIMIT", message: "The course catalog index needs repair before this change." });
  for (const row of previous) {
    const key = `${row.kind}:${row.key}`, target = remaining.get(key);
    if (!target) await ctx.db.delete("lms_course_catalog", row._id);
    else {
      if (row.createdAt !== target.createdAt) await ctx.db.patch("lms_course_catalog", row._id, { createdAt: target.createdAt });
      remaining.delete(key);
    }
  }
  for (const entry of remaining.values()) await ctx.db.insert("lms_course_catalog", { courseId, ...entry });
}

export async function courseCatalogIsReady(ctx: Pick<QueryCtx, "db">, ledger?: RequestReadLedger): Promise<boolean> {
  ledger?.beforeRead();
  const pending = await ctx.db.query("lms_courses").withIndex("by_catalog_index_version", q => q.eq("catalogIndexVersion", undefined)).first();
  ledger?.record(pending);
  return pending === null;
}
