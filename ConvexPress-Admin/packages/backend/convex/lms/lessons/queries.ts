/**
 * Lesson System - queries.
 */

import { v } from "convex/values";
import { query } from "../../_generated/server";
import { isPluginEnabled } from "../../helpers/plugins";
import { hasMinimumRoleLevel } from "../../helpers/permissions";
import { docToText } from "./helpers";
import { canUserAccessNode, requireNodeCourseAuthorOrEditor } from "../access";

function lessonPayload(node: any) {
  return {
    node,
    bodyDoc: node.bodyDoc ?? null,
    materialsDoc: node.materialsDoc ?? null,
    bodyText: docToText(node.bodyDoc),
    materialsText: docToText(node.materialsDoc),
  };
}

export const getLessonForEdit = query({
  args: { nodeId: v.id("lms_nodes") },
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "lms"))) return null;
    const node = await ctx.db.get(args.nodeId);
    if (!node || node.kind !== "lesson") return null;
    await requireNodeCourseAuthorOrEditor(ctx, args.nodeId, "lms.lesson.edit");
    return lessonPayload(node);
  },
});

export const getLessonForPlayer = query({
  args: { nodeId: v.id("lms_nodes") },
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "lms"))) return null;
    const node = await ctx.db.get(args.nodeId);
    if (!node || node.kind !== "lesson") return null;
    const canAuthor = await hasMinimumRoleLevel(ctx, 60);
    if (!canAuthor) {
      const access = await canUserAccessNode(ctx, { nodeId: args.nodeId });
      if (!access.allowed) return null;
    }
    return lessonPayload(node);
  },
});

export const getLessonPublicView = query({
  args: { nodeId: v.id("lms_nodes") },
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "lms"))) return null;
    const node = await ctx.db.get(args.nodeId);
    if (!node || node.kind !== "lesson") return null;
    const access = await canUserAccessNode(ctx, { nodeId: args.nodeId });
    if (!access.allowed) return null;
    return lessonPayload(node);
  },
});

export const getLesson = query({
  args: { nodeId: v.id("lms_nodes") },
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "lms"))) return null;
    const node = await ctx.db.get(args.nodeId);
    if (!node || node.kind !== "lesson") return null;
    const canAuthor = await hasMinimumRoleLevel(ctx, 60);
    if (!canAuthor) {
      const access = await canUserAccessNode(ctx, { nodeId: args.nodeId });
      if (!access.allowed) return null;
    }
    return lessonPayload(node);
  },
});

export const listVersions = query({
  args: { nodeId: v.id("lms_nodes") },
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
