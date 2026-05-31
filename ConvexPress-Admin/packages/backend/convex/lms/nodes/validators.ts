/**
 * Curriculum tree (nodes) - argument validators.
 */

import { v } from "convex/values";
import { lmsNodeKindValidator } from "../../schema/lms";

export const createNodeArgs = {
  courseId: v.id("lms_courses"),
  parentId: v.optional(v.id("lms_nodes")),
  kind: lmsNodeKindValidator,
  title: v.string(),
};

export const nodeIdArg = { nodeId: v.id("lms_nodes") };

export const renameNodeArgs = {
  nodeId: v.id("lms_nodes"),
  title: v.string(),
};

export const moveNodeArgs = {
  nodeId: v.id("lms_nodes"),
  direction: v.union(v.literal("up"), v.literal("down")),
};
