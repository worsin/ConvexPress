/**
 * Course System - internal helpers.
 */

import type { MutationCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import { slugify } from "../../helpers/slug";

/** Generate a slug unique within lms_courses. */
export async function generateUniqueCourseSlug(
  ctx: MutationCtx,
  title: string,
  existingId?: Id<"lms_courses">,
): Promise<string> {
  const base = slugify(title) || "course";
  let slug = base;
  let suffix = 2;
  while (true) {
    const existing = await ctx.db
      .query("lms_courses")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();
    if (!existing || (existingId && existing._id === existingId)) break;
    slug = `${base}-${suffix}`;
    suffix++;
    if (suffix > 1000) {
      slug = `${base}-${Date.now()}`;
      break;
    }
  }
  return slug;
}
