/**
 * Topic System - mutations (topic semantics on lms_nodes where kind="topic").
 */

import { ConvexError, v } from "convex/values";
import { mutation } from "../../_generated/server";
import { requirePluginEnabled } from "../../helpers/plugins";
import { emitEvent } from "../../helpers/events";
import { LMS_EVENTS, SYSTEM } from "../../events/constants";
import { lmsDripModeValidator } from "../../schema/lms";
import { requireNodeCourseAuthorOrEditor } from "../access";

export const updateTopic = mutation({
  args: {
    nodeId: v.id("lms_nodes"),
    description: v.optional(v.string()),
    dripMode: v.optional(lmsDripModeValidator),
    dripOffsetDays: v.optional(v.number()),
    dripDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "lms");
    const { node } = await requireNodeCourseAuthorOrEditor(ctx, args.nodeId, "lms.builder.manage");
    if (!node || node.kind !== "topic") {
      throw new ConvexError({ code: "VALIDATION_ERROR", message: "Not a topic" });
    }
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.description !== undefined) patch.description = args.description;
    if (args.dripMode !== undefined) patch.topicDripMode = args.dripMode;
    if (args.dripOffsetDays !== undefined) patch.topicDripOffsetDays = args.dripOffsetDays;
    if (args.dripDate !== undefined) patch.topicDripDate = args.dripDate;
    await ctx.db.patch(args.nodeId, patch as never);
    await emitEvent(ctx, LMS_EVENTS.TOPIC_UPDATED, SYSTEM.LMS, {
      courseId: node.courseId,
      nodeId: args.nodeId,
    });
    return args.nodeId;
  },
});
