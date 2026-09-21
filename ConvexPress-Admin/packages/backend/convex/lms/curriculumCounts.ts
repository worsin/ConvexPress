import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { RequestReadLedger } from "../helpers/requestReadLedger";

export const CURRICULUM_COUNT_FIELDS = ["courseId", "kind", "curriculumCountVersion"] as const;
type Source = Record<string, unknown> | null;
type Counts = { lessons: number; topics: number };
const contribution = (row: Source): Counts => ({
  lessons: row?.kind === "lesson" ? 1 : 0,
  topics: row?.kind === "topic" ? 1 : 0,
});

/** Called in the source writer's transaction. Previous stored markers, never
 * incoming import markers, determine whether a contribution already exists. */
export async function adjustCurriculumCounts(
  ctx: Pick<MutationCtx, "db">, previous: Source, next: Source, ledger?: RequestReadLedger,
): Promise<Id<"lms_courses">[]> {
  const courses = [...new Set([previous?.courseId, next?.courseId].filter((id): id is string => typeof id === "string"))] as Id<"lms_courses">[];
  for (const courseId of courses) {
    const before = previous?.courseId === courseId && previous.curriculumCountVersion === 1 ? contribution(previous) : { lessons: 0, topics: 0 };
    const after = next?.courseId === courseId ? contribution(next) : { lessons: 0, topics: 0 };
    const lessonDelta = after.lessons - before.lessons, topicDelta = after.topics - before.topics;
    if (!lessonDelta && !topicDelta && previous?.curriculumCountVersion === 1 && previous.courseId === next?.courseId) continue;
    ledger?.beforeRead();
    const row = await ctx.db.query("lms_curriculum_counts").withIndex("by_course", q => q.eq("courseId", courseId)).unique();
    ledger?.record(row);
    const lessons = (row?.lessons ?? 0) + lessonDelta, topics = (row?.topics ?? 0) + topicDelta;
    if (![lessons, topics].every(value => Number.isSafeInteger(value) && value >= 0))
      throw new ConvexError({ code: "CURRICULUM_COUNTS_INVALID", message: "Curriculum counts require repair before changing this lesson." });
    if (row) await ctx.db.patch("lms_curriculum_counts", row._id, { lessons, topics, revision: row.revision + 1, progressRefreshPending: true });
    else await ctx.db.insert("lms_curriculum_counts", { courseId, lessons, topics, revision: 1, progressRefreshPending: true });
  }
  return courses;
}

/** A partial legacy backfill is never a valid denominator. This read is constant
 * in course size: one pending-source lookup and one aggregate lookup. An absent\n * aggregate needs one extra source probe so missing derived data cannot mean zero. */
export async function readCurriculumCounts(
  ctx: Pick<QueryCtx, "db">, courseId: Id<"lms_courses">, ledger?: RequestReadLedger,
): Promise<({ state: "ready"; revision: number } & Counts) | { state: "preparing" }> {
  ledger?.beforeRead();
  const pending = await ctx.db.query("lms_nodes").withIndex("by_course_count_version", q => q.eq("courseId", courseId).eq("curriculumCountVersion", undefined)).first();
  ledger?.record(pending);
  if (pending) return { state: "preparing" };
  ledger?.beforeRead();
  const row = await ctx.db.query("lms_curriculum_counts").withIndex("by_course", q => q.eq("courseId", courseId)).unique();
  ledger?.record(row);
  if (!row) {
    ledger?.beforeRead();
    const existing = await ctx.db.query("lms_nodes").withIndex("by_course", q => q.eq("courseId", courseId)).first();
    ledger?.record(existing);
    if (existing) return { state: "preparing" };
  }
  return { state: "ready", lessons: row?.lessons ?? 0, topics: row?.topics ?? 0, revision: row?.revision ?? 0 };
}
