import { z } from "zod";
import { streamQuery } from "convex-helpers/server/pagination";
import { sha256Hex } from "@convexpress/site-contract";
import schema from "../schema";
import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { RequestReadLedger } from "../helpers/requestReadLedger";
import { isPluginEnabled } from "../helpers/plugins";
import { CanonicalDataError, stableKey, type DataScope } from "../canonicalDocuments/foundation/contracts";
import { courseCatalogIsReady } from "./courseCatalog";

const argsSchema = z.strictObject({
  category: z.string().trim().min(1).max(256).optional(),
  limit: z.number().int().min(1).max(48).default(6),
  cursor: z.string().min(1).max(4096).nullable().default(null),
});
const cursorSchema = z.strictObject({
  version: z.literal(1), binding: z.string().regex(/^[a-f0-9]{64}$/),
  key: z.tuple([z.enum(["recent", "category"]), z.string().max(256), z.number().finite(), z.number().finite(), z.string().min(1).max(256)]),
});
export type CourseCatalogPage = {
  state: "ready" | "preparing";
  courses: Doc<"lms_courses">[];
  cursor: string | null;
  nextCursor: string | null;
};

/** Service-only candidates. Callers must project a public DTO, never return these
 * complete source records from a registered query or send them to a renderer. */
export async function readCourseCatalogPage(ctx: QueryCtx, rawArgs: unknown,
  scope: DataScope, documentId: string, budget = new RequestReadLedger()): Promise<CourseCatalogPage> {
  const args = argsSchema.parse(rawArgs);
  const kind = args.category ? "category" : "recent", key = args.category?.toLowerCase() ?? "";
  const binding = sha256Hex(stableKey({ scope, documentId, kind, key, limit: args.limit }));
  const cursor = args.cursor === null ? null : cursorSchema.parse(JSON.parse(args.cursor));
  if (cursor && (cursor.binding !== binding || cursor.key[0] !== kind || cursor.key[1] !== key || !ctx.db.normalizeId("lms_course_catalog", cursor.key[4])))
    throw new CanonicalDataError("COURSE_CURSOR_SCOPE", "cursor", "Course cursor belongs to another document, category or environment");
  const empty = (state: CourseCatalogPage["state"]): CourseCatalogPage => ({ state, courses: [], cursor: args.cursor, nextCursor: null });
  if (!await isPluginEnabled(ctx, "lms", budget)) return empty("ready");
  if (!await courseCatalogIsReady(ctx, budget)) return empty("preparing");
  const courses: Doc<"lms_courses">[] = [];
  let lastKey: z.infer<typeof cursorSchema>["key"] | null = null, nextCursor: string | null = null;
  const iterator = streamQuery(ctx, { schema, table: "lms_course_catalog", index: "by_selection_created", order: "desc",
    startIndexKey: cursor?.key ?? [kind, key], startInclusive: cursor === null, endIndexKey: [kind, key], endInclusive: true });
  try {
    while (true) {
      budget.beforeRead();
      const next = await iterator.next();
      if (next.done) break;
      const [coordinate, indexKey] = next.value;
      budget.record(coordinate);
      budget.beforeRead();
      const course = budget.record(await ctx.db.get("lms_courses", coordinate.courseId));
      // Imported or stale coordinates cannot make an unpublished/moved course public.
      const matches = course?.status === "published" && (kind === "recent" || course.categoryIds?.some(category => category.trim().toLowerCase() === key));
      if (matches && courses.length === args.limit) {
        if (lastKey) nextCursor = JSON.stringify({ version: 1, binding, key: lastKey });
        break;
      }
      if (matches) courses.push(course);
      lastKey = cursorSchema.shape.key.parse(indexKey);
    }
  } finally { await iterator.return(undefined); }
  return { state: "ready", courses, cursor: args.cursor, nextCursor };
}
