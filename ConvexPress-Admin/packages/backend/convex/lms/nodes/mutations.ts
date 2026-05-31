/**
 * Curriculum tree (nodes) - mutations.
 *
 * Owns the lms_nodes structural operations: create / rename / move / delete,
 * with nesting validation (topics top-level; lessons + section headings under
 * a topic). Author-own-or-Editor gated.
 */

import { ConvexError, v } from "convex/values";
import { mutation } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import { requirePluginEnabled } from "../../helpers/plugins";
import { emitEvent } from "../../helpers/events";
import { LMS_EVENTS, SYSTEM } from "../../events/constants";
import { requireCourseAuthorOrEditor, requireNodeCourseAuthorOrEditor } from "../access";
import { createNodeArgs, nodeIdArg, renameNodeArgs, moveNodeArgs } from "./validators";

async function recountCourse(ctx: any, courseId: Id<"lms_courses">) {
  const nodes = await ctx.db
    .query("lms_nodes")
    .withIndex("by_course", (q: any) => q.eq("courseId", courseId))
    .collect();
  const topicCount = nodes.filter((n: any) => n.kind === "topic").length;
  const lessonCount = nodes.filter((n: any) => n.kind === "lesson").length;
  await ctx.db.patch(courseId, { topicCount, lessonCount, updatedAt: Date.now() });
}

export const createNode = mutation({
  args: createNodeArgs,
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "lms");
    await requireCourseAuthorOrEditor(ctx, args.courseId);

    // Nesting rules.
    if (args.kind === "topic" && args.parentId) {
      throw new ConvexError({ code: "VALIDATION_ERROR", message: "Topics are top-level" });
    }
    if (args.kind === "lesson" || args.kind === "section_heading") {
      if (!args.parentId) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: "Lessons and section headings must belong to a topic",
        });
      }
      const parent = await ctx.db.get(args.parentId);
      if (!parent || parent.kind !== "topic") {
        throw new ConvexError({ code: "VALIDATION_ERROR", message: "Parent must be a topic" });
      }
      if (parent.courseId !== args.courseId) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: "Parent topic must belong to this course",
        });
      }
    }

    // Append at end of siblings.
    const siblings = await ctx.db
      .query("lms_nodes")
      .withIndex("by_course", (q) => q.eq("courseId", args.courseId))
      .collect();
    const sameParent = siblings.filter((n) =>
      args.parentId ? n.parentId === args.parentId : !n.parentId,
    );
    const maxPos = sameParent.reduce((m, n) => Math.max(m, n.position), 0);

    const now = Date.now();
    const nodeId = await ctx.db.insert("lms_nodes", {
      courseId: args.courseId,
      parentId: args.parentId,
      kind: args.kind,
      title: args.title.trim() || "Untitled",
      position: maxPos + 1,
      ...(args.kind === "lesson" ? { showMarkComplete: true } : {}),
      createdAt: now,
      updatedAt: now,
    });
    await recountCourse(ctx, args.courseId);
    await emitEvent(ctx, LMS_EVENTS.NODE_CREATED, SYSTEM.LMS, {
      courseId: args.courseId,
      nodeId,
      kind: args.kind,
    });
    return nodeId;
  },
});

export const renameNode = mutation({
  args: renameNodeArgs,
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "lms");
    await requireNodeCourseAuthorOrEditor(ctx, args.nodeId);
    await ctx.db.patch(args.nodeId, {
      title: args.title.trim() || "Untitled",
      updatedAt: Date.now(),
    });
    await emitEvent(ctx, LMS_EVENTS.NODE_UPDATED, SYSTEM.LMS, { nodeId: args.nodeId });
    return args.nodeId;
  },
});

export const deleteNode = mutation({
  args: nodeIdArg,
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "lms");
    const { node } = await requireNodeCourseAuthorOrEditor(ctx, args.nodeId);

    // Cascade: delete descendants (children of this node).
    const all = await ctx.db
      .query("lms_nodes")
      .withIndex("by_course", (q) => q.eq("courseId", node.courseId))
      .collect();
    const toDelete = new Set<string>([args.nodeId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const n of all) {
        if (n.parentId && toDelete.has(n.parentId) && !toDelete.has(n._id)) {
          toDelete.add(n._id);
          changed = true;
        }
      }
    }
    for (const idStr of toDelete) {
      await ctx.db.delete(idStr as Id<"lms_nodes">);
    }
    await recountCourse(ctx, node.courseId);
    await emitEvent(ctx, LMS_EVENTS.NODE_DELETED, SYSTEM.LMS, {
      courseId: node.courseId,
      nodeId: args.nodeId,
      count: toDelete.size,
    });
    return { deleted: true };
  },
});

export const moveNode = mutation({
  args: moveNodeArgs,
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "lms");
    const { node } = await requireNodeCourseAuthorOrEditor(ctx, args.nodeId);

    const siblings = (
      await ctx.db
        .query("lms_nodes")
        .withIndex("by_course", (q) => q.eq("courseId", node.courseId))
        .collect()
    )
      .filter((n) => (node.parentId ? n.parentId === node.parentId : !n.parentId))
      .sort((a, b) => a.position - b.position);

    const idx = siblings.findIndex((n) => n._id === args.nodeId);
    const swapWith = args.direction === "up" ? idx - 1 : idx + 1;
    if (swapWith < 0 || swapWith >= siblings.length) return args.nodeId;

    const a = siblings[idx];
    const b = siblings[swapWith];
    await ctx.db.patch(a._id, { position: b.position, updatedAt: Date.now() });
    await ctx.db.patch(b._id, { position: a.position, updatedAt: Date.now() });
    await emitEvent(ctx, LMS_EVENTS.NODE_REORDERED, SYSTEM.LMS, {
      courseId: node.courseId,
      nodeId: args.nodeId,
    });
    return args.nodeId;
  },
});

/** Set an explicit order for a set of sibling nodes (drag-and-drop). */
export const reorderNodes = mutation({
  args: {
    orderedIds: v.array(v.id("lms_nodes")),
  },
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "lms");
    if (args.orderedIds.length === 0) return { ok: true };

    const nodes = [];
    for (const nodeId of args.orderedIds) {
      const node = await ctx.db.get(nodeId);
      if (!node) {
        throw new ConvexError({ code: "NOT_FOUND", message: "Node not found" });
      }
      nodes.push(node);
    }
    const courseId = nodes[0].courseId;
    await requireCourseAuthorOrEditor(ctx, courseId);
    const parentId = nodes[0].parentId ?? null;
    const kind = nodes[0].kind;
    for (const node of nodes) {
      if (node.courseId !== courseId || (node.parentId ?? null) !== parentId) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: "Only sibling nodes in the same course can be reordered together.",
        });
      }
      if ((kind === "topic") !== (node.kind === "topic")) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: "Topics and child nodes must be reordered separately.",
        });
      }
    }

    let pos = 1;
    for (const nodeId of args.orderedIds) {
      await ctx.db.patch(nodeId, { position: pos, updatedAt: Date.now() });
      pos += 1;
    }
    await emitEvent(ctx, LMS_EVENTS.NODE_REORDERED, SYSTEM.LMS, {
      courseId,
      parentId: parentId ?? undefined,
      count: args.orderedIds.length,
    });
    return { ok: true };
  },
});
