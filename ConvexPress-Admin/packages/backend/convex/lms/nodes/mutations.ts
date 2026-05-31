/**
 * Curriculum tree (nodes) - mutations.
 *
 * Owns the lms_nodes structural operations: create / rename / move / delete,
 * with nesting validation (topics top-level; lessons + section headings under
 * a topic). Author (60+) gated.
 */

import { ConvexError } from "convex/values";
import { mutation } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import { requireMinimumRoleLevel } from "../../helpers/permissions";
import { requirePluginEnabled } from "../../helpers/plugins";
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
    await requireMinimumRoleLevel(ctx, 60);

    const course = await ctx.db.get(args.courseId);
    if (!course) throw new ConvexError({ code: "NOT_FOUND", message: "Course not found" });

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
    return nodeId;
  },
});

export const renameNode = mutation({
  args: renameNodeArgs,
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "lms");
    await requireMinimumRoleLevel(ctx, 60);
    await ctx.db.patch(args.nodeId, {
      title: args.title.trim() || "Untitled",
      updatedAt: Date.now(),
    });
    return args.nodeId;
  },
});

export const deleteNode = mutation({
  args: nodeIdArg,
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "lms");
    await requireMinimumRoleLevel(ctx, 60);
    const node = await ctx.db.get(args.nodeId);
    if (!node) return { deleted: false };

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
    return { deleted: true };
  },
});

export const moveNode = mutation({
  args: moveNodeArgs,
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "lms");
    await requireMinimumRoleLevel(ctx, 60);
    const node = await ctx.db.get(args.nodeId);
    if (!node) throw new ConvexError({ code: "NOT_FOUND", message: "Node not found" });

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
    return args.nodeId;
  },
});
