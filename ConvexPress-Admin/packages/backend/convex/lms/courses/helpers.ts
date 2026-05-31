import type { MutationCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import { slugify } from "../../helpers/slug";
import { docToText } from "../lessons/helpers";

const MAX_INDEXED_TITLE_LENGTH = 500;
const MAX_INDEXED_CONTENT_LENGTH = 100000;

function truncate(value: string, maxLength: number): string {
  const text = value.trim();
  if (text.length <= maxLength) return text;
  const clipped = text.slice(0, maxLength);
  const lastSpace = clipped.lastIndexOf(" ");
  return lastSpace > maxLength * 0.8 ? clipped.slice(0, lastSpace) : clipped;
}

function strip(value: string): string {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

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

export function normalizeCourseLabels(values: readonly string[] | undefined): string[] | undefined {
  if (!values) return undefined;
  const seen = new Set<string>();
  const normalized = values
    .map((value) =>
      value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, ""),
    )
    .filter(Boolean)
    .filter((value) => {
      if (seen.has(value)) return false;
      seen.add(value);
      return true;
    })
    .slice(0, 20);
  return normalized.length ? normalized : [];
}

export async function upsertCourseSearchIndex(
  ctx: MutationCtx,
  courseId: Id<"lms_courses">,
) {
  const course = await ctx.db.get(courseId);
  if (!course) return;

  const existing = await ctx.db
    .query("searchIndex")
    .withIndex("by_content", (q) =>
      q.eq("contentType", "course").eq("contentId", String(courseId)),
    )
    .unique();

  if (course.status === "archived") {
    if (existing) await ctx.db.delete(existing._id);
    return;
  }

  const now = Date.now();
  const title = truncate(strip(course.title), MAX_INDEXED_TITLE_LENGTH);
  const description = strip(docToText(course.descriptionDoc));
  const excerpt = strip(course.excerpt ?? "") || truncate(description, 200);
  const content = truncate(
    [
      title,
      excerpt,
      description,
      ...(course.categoryIds ?? []),
      ...(course.tagIds ?? []),
    ].join("\n"),
    MAX_INDEXED_CONTENT_LENGTH,
  );
  const author = await ctx.db.get(course.authorId);
  const authorName =
    author?.displayName ||
    `${author?.firstName ?? ""} ${author?.lastName ?? ""}`.trim() ||
    author?.email ||
    "Unknown";

  const payload = {
    contentType: "course" as const,
    contentId: String(courseId),
    title,
    content,
    excerpt,
    authorId: String(course.authorId),
    authorName,
    status: course.status === "published" ? "publish" : course.status,
    categoryNames: course.categoryIds,
    tagNames: course.tagIds,
    url: `/courses/${course.slug}`,
    boostScore: course.status === "published" ? 2 : undefined,
    publishedAt: course.publishedAt,
    indexedAt: now,
    createdAt: course.createdAt,
    updatedAt: course.updatedAt,
  };

  if (existing) {
    await ctx.db.patch(existing._id, payload);
  } else {
    await ctx.db.insert("searchIndex", payload);
  }
}

export async function deleteCourseSearchIndex(
  ctx: MutationCtx,
  courseId: Id<"lms_courses">,
) {
  const existing = await ctx.db
    .query("searchIndex")
    .withIndex("by_content", (q) =>
      q.eq("contentType", "course").eq("contentId", String(courseId)),
    )
    .unique();
  if (existing) await ctx.db.delete(existing._id);
}
