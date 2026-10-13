/**
 * Lesson System - queries.
 */

import { v, type Infer } from "convex/values";
import { query, type QueryCtx } from "../../_generated/server";
import type { Doc } from "../../_generated/dataModel";
import { isPluginEnabled } from "../../helpers/plugins";
import { currentUserCan } from "../../helpers/permissions";
import { docToText } from "./helpers";
import { canUserAccessNode, requireNodeCourseAuthorOrEditor } from "../access";
import { lmsDocs } from "../../schema/lms.docs.generated";

// bodyDoc/materialsDoc are stored Tiptap JSON; they reuse the schema's own
// field validators for those columns.
const lessonContentFields = {
  bodyDoc: lmsDocs.lms_nodes.fields.bodyDoc,
  materialsDoc: lmsDocs.lms_nodes.fields.materialsDoc,
  bodyText: v.string(),
  materialsText: v.string(),
};

const lessonEditPayloadValidator = v.object({
  node: lmsDocs.lms_nodes,
  ...lessonContentFields,
});

/** Lesson node without its body, materials, and AI media/transcript fields. */
const runtimeNodeValidator = lmsDocs.lms_nodes.omit(
  "bodyDoc",
  "materialsDoc",
  "transcriptText",
  "audioMediaId",
  "captionsMediaId",
  "aiVideoMediaId",
);

const lessonRuntimePayloadValidator = v.object({
  node: runtimeNodeValidator,
  ...lessonContentFields,
});

function lessonEditPayload(node: Doc<"lms_nodes">): Infer<typeof lessonEditPayloadValidator> {
  return {
    node,
    bodyDoc: node.bodyDoc ?? null,
    materialsDoc: node.materialsDoc ?? null,
    bodyText: docToText(node.bodyDoc),
    materialsText: docToText(node.materialsDoc),
  };
}

function lessonRuntimePayload(node: Doc<"lms_nodes">): Infer<typeof lessonRuntimePayloadValidator> {
  return {
    node: runtimeNode(node),
    bodyDoc: node.bodyDoc ?? null,
    materialsDoc: node.materialsDoc ?? null,
    bodyText: docToText(node.bodyDoc),
    materialsText: docToText(node.materialsDoc),
  };
}

function runtimeNode(node: Doc<"lms_nodes">): Infer<typeof runtimeNodeValidator> {
  const {
    bodyDoc: _bodyDoc,
    materialsDoc: _materialsDoc,
    transcriptText: _transcriptText,
    audioMediaId: _audioMediaId,
    captionsMediaId: _captionsMediaId,
    aiVideoMediaId: _aiVideoMediaId,
    ...publicNode
  } = node;
  return publicNode;
}

async function canPreviewLesson(ctx: QueryCtx) {
  return (
    (await currentUserCan(ctx, "lms.course.view")) ||
    (await currentUserCan(ctx, "lms.lesson.edit"))
  );
}

export const getLessonForEdit = query({
  args: { nodeId: v.id("lms_nodes") },
  returns: v.union(v.null(), lessonEditPayloadValidator),
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "lms"))) return null;
    const node = await ctx.db.get(args.nodeId);
    if (!node || node.kind !== "lesson") return null;
    await requireNodeCourseAuthorOrEditor(ctx, args.nodeId, "lms.lesson.edit");
    return lessonEditPayload(node);
  },
});

export const getLessonForPlayer = query({
  args: { nodeId: v.id("lms_nodes") },
  returns: v.union(v.null(), lessonRuntimePayloadValidator),
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "lms"))) return null;
    const node = await ctx.db.get(args.nodeId);
    if (!node || node.kind !== "lesson") return null;
    if (!(await canPreviewLesson(ctx))) {
      const access = await canUserAccessNode(ctx, { nodeId: args.nodeId });
      if (!access.allowed) return null;
    }
    return lessonRuntimePayload(node);
  },
});

export const getLessonPublicView = query({
  args: { nodeId: v.id("lms_nodes") },
  returns: v.union(v.null(), lessonRuntimePayloadValidator),
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "lms"))) return null;
    const node = await ctx.db.get(args.nodeId);
    if (!node || node.kind !== "lesson") return null;
    const access = await canUserAccessNode(ctx, { nodeId: args.nodeId });
    if (!access.allowed) return null;
    return lessonRuntimePayload(node);
  },
});

export const getLesson = query({
  args: { nodeId: v.id("lms_nodes") },
  returns: v.union(v.null(), lessonRuntimePayloadValidator),
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "lms"))) return null;
    const node = await ctx.db.get(args.nodeId);
    if (!node || node.kind !== "lesson") return null;
    if (!(await canPreviewLesson(ctx))) {
      const access = await canUserAccessNode(ctx, { nodeId: args.nodeId });
      if (!access.allowed) return null;
    }
    return lessonRuntimePayload(node);
  },
});

export const listVersions = query({
  args: { nodeId: v.id("lms_nodes") },
  returns: v.array(lmsDocs.lms_lessonVersions.extend({
    bodyText: v.string(),
    snapshotFields: v.array(v.string()),
  })),
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "lms"))) return [];
    const { node } = await requireNodeCourseAuthorOrEditor(ctx, args.nodeId, "lms.lesson.edit");
    if (node.kind !== "lesson") return [];
    const versions = await ctx.db
      .query("lms_lessonVersions")
      .withIndex("by_node", (q) => q.eq("nodeId", args.nodeId))
      .collect();
    return versions
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((version) => ({
        ...version,
        bodyText: docToText(version.bodyDoc),
        snapshotFields: snapshotFields(version.snapshotJson),
      }));
  },
});

function snapshotFields(snapshot: unknown): string[] {
  const value = snapshot as { values?: Record<string, unknown>; unsetFields?: unknown[] } | null;
  if (!value) return ["bodyDoc"];
  if (value.values || value.unsetFields) {
    return Array.from(
      new Set([
        ...Object.keys(value.values ?? {}),
        ...(Array.isArray(value.unsetFields) ? value.unsetFields.map(String) : []),
      ]),
    );
  }
  const legacyFields = Object.keys(value as Record<string, unknown>);
  return legacyFields.length > 0 ? legacyFields : ["bodyDoc"];
}
