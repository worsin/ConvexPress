/**
 * Lesson System - mutations (leaf content: body, video, materials, settings).
 */

import { ConvexError, v } from "convex/values";
import { mutation } from "../../_generated/server";
import { requirePluginEnabled } from "../../helpers/plugins";
import { emitEvent } from "../../helpers/events";
import { LMS_EVENTS, SYSTEM } from "../../events/constants";
import {
  detectVideoProvider,
  docsEqual,
  normalizeLessonText,
  normalizeLessonTitle,
  normalizeNonNegativeInt,
  normalizeOptionalUrl,
  textToDoc,
} from "./helpers";
import { lmsDripModeValidator } from "../../schema/lms";
import { requireNodeCourseAuthorOrEditor } from "../access";

export const updateLessonContent = mutation({
  args: {
    nodeId: v.id("lms_nodes"),
    expectedUpdatedAt: v.optional(v.number()),
    title: v.optional(v.string()),
    bodyText: v.optional(v.string()),
    materialsText: v.optional(v.string()),
    videoUrl: v.optional(v.string()),
    videoMediaId: v.optional(v.union(v.id("media"), v.null())),
    isPreview: v.optional(v.boolean()),
    requireVideoWatch: v.optional(v.boolean()),
    autoComplete: v.optional(v.boolean()),
    completionDelaySec: v.optional(v.number()),
    minTimeSeconds: v.optional(v.number()),
    showMarkComplete: v.optional(v.boolean()),
    dripMode: v.optional(lmsDripModeValidator),
    dripOffsetDays: v.optional(v.number()),
    dripDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "lms");
    const { user, node } = await requireNodeCourseAuthorOrEditor(ctx, args.nodeId, "lms.lesson.edit");
    if (node.kind !== "lesson") {
      throw new ConvexError({ code: "VALIDATION_ERROR", message: "Node is not a lesson" });
    }
    if (args.expectedUpdatedAt !== undefined && node.updatedAt !== args.expectedUpdatedAt) {
      throw new ConvexError({
        code: "EDIT_CONFLICT",
        message: "This lesson changed since you opened it. Refresh before saving.",
        serverUpdatedAt: node.updatedAt,
      });
    }

    const now = Date.now();
    const patch: Record<string, unknown> = { updatedAt: now };
    const nextBodyDoc =
      args.bodyText !== undefined ? textToDoc(normalizeLessonText(args.bodyText)) : undefined;
    const videoUrlProvided = Object.prototype.hasOwnProperty.call(args, "videoUrl");
    const videoMediaProvided = Object.prototype.hasOwnProperty.call(args, "videoMediaId");
    const nextVideoUrl = videoUrlProvided
      ? normalizeOptionalUrl(args.videoUrl)
      : node.videoUrl;
    const nextVideoMediaId = videoMediaProvided ? args.videoMediaId : node.videoMediaId;
    const hasVideoSource = !!nextVideoUrl || !!nextVideoMediaId;

    const nextRequireVideoWatch = args.requireVideoWatch ?? node.requireVideoWatch ?? false;
    if (nextRequireVideoWatch && !hasVideoSource) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "A lesson must have a video before requiring video watch completion.",
      });
    }

    if (args.title !== undefined) patch.title = normalizeLessonTitle(args.title);
    if (nextBodyDoc !== undefined) patch.bodyDoc = nextBodyDoc;
    if (args.materialsText !== undefined) {
      patch.materialsDoc = textToDoc(normalizeLessonText(args.materialsText));
    }
    if (videoUrlProvided) {
      patch.videoUrl = nextVideoUrl;
      patch.videoProvider = nextVideoUrl ? detectVideoProvider(nextVideoUrl) : undefined;
    }
    if (videoMediaProvided) patch.videoMediaId = args.videoMediaId ?? undefined;
    if (args.isPreview !== undefined) patch.isPreview = args.isPreview;
    if (args.requireVideoWatch !== undefined) patch.requireVideoWatch = args.requireVideoWatch;
    if (args.autoComplete !== undefined) patch.autoComplete = args.autoComplete;
    if (args.completionDelaySec !== undefined) {
      patch.completionDelaySec = normalizeNonNegativeInt(args.completionDelaySec) ?? 0;
    }
    if (args.minTimeSeconds !== undefined) {
      patch.minTimeSeconds = normalizeNonNegativeInt(args.minTimeSeconds) ?? 0;
    }
    if (args.showMarkComplete !== undefined) patch.showMarkComplete = args.showMarkComplete;
    if (args.dripMode !== undefined) {
      patch.lessonDripMode = args.dripMode;
      if (args.dripMode !== "enrollment_based") patch.lessonDripOffsetDays = undefined;
      if (args.dripMode !== "specific_date") patch.lessonDripDate = undefined;
    }
    if (args.dripOffsetDays !== undefined) {
      patch.lessonDripOffsetDays = normalizeNonNegativeInt(args.dripOffsetDays) ?? 0;
    }
    if (args.dripDate !== undefined) patch.lessonDripDate = args.dripDate;

    const changedFields = Object.entries(patch)
      .filter(([field]) => field !== "updatedAt")
      .filter(([field, value]) => !docsEqual((node as any)[field], value))
      .map(([field]) => field);

    if (changedFields.length === 0) {
      return { nodeId: args.nodeId, updatedAt: node.updatedAt, changedFields: [] };
    }

    await ctx.db.insert("lms_lessonVersions", {
      nodeId: args.nodeId,
      bodyDoc: node.bodyDoc ?? textToDoc(""),
      snapshotJson: lessonSnapshot(node),
      editedBy: user._id,
      createdAt: now,
    });

    await ctx.db.patch(args.nodeId, patch as never);
    await emitEvent(ctx, LMS_EVENTS.LESSON_UPDATED, SYSTEM.LMS, {
      nodeId: args.nodeId,
      courseId: node.courseId,
      changedFields,
    });
    return { nodeId: args.nodeId, updatedAt: now, changedFields };
  },
});

export const restoreLessonVersion = mutation({
  args: {
    nodeId: v.id("lms_nodes"),
    versionId: v.id("lms_lessonVersions"),
  },
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "lms");
    const { user, node } = await requireNodeCourseAuthorOrEditor(ctx, args.nodeId, "lms.lesson.edit");
    if (node.kind !== "lesson") {
      throw new ConvexError({ code: "VALIDATION_ERROR", message: "Node is not a lesson" });
    }
    const version = await ctx.db.get(args.versionId);
    if (!version || version.nodeId !== args.nodeId) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Lesson version not found" });
    }
    await ctx.db.insert("lms_lessonVersions", {
      nodeId: args.nodeId,
      bodyDoc: node.bodyDoc ?? textToDoc(""),
      snapshotJson: lessonSnapshot(node),
      editedBy: user._id,
      createdAt: Date.now(),
    });
    const snapshot = (version.snapshotJson ?? {}) as Record<string, unknown>;
    const patch = restorePatchFromSnapshot(snapshot, version.bodyDoc);
    const now = Date.now();
    await ctx.db.patch(args.nodeId, {
      ...patch,
      updatedAt: now,
    });
    await emitEvent(ctx, LMS_EVENTS.LESSON_VERSION_RESTORED, SYSTEM.LMS, {
      nodeId: args.nodeId,
      versionId: args.versionId,
      courseId: node.courseId,
      restoredFields: Object.keys(patch),
    });
    return { nodeId: args.nodeId, updatedAt: now, restoredFields: Object.keys(patch) };
  },
});

function lessonSnapshot(node: any) {
  const snapshot = {
    title: node.title,
    bodyDoc: node.bodyDoc,
    materialsDoc: node.materialsDoc,
    videoUrl: node.videoUrl,
    videoProvider: node.videoProvider,
    videoMediaId: node.videoMediaId,
    isPreview: node.isPreview,
    requireVideoWatch: node.requireVideoWatch,
    autoComplete: node.autoComplete,
    completionDelaySec: node.completionDelaySec,
    minTimeSeconds: node.minTimeSeconds,
    showMarkComplete: node.showMarkComplete,
    lessonDripMode: node.lessonDripMode,
    lessonDripOffsetDays: node.lessonDripOffsetDays,
    lessonDripDate: node.lessonDripDate,
  };
  const values = Object.fromEntries(
    Object.entries(snapshot).filter(([, value]) => value !== undefined),
  );
  const unsetFields = Object.entries(snapshot)
    .filter(([, value]) => value === undefined)
    .map(([field]) => field);
  return { values, unsetFields };
}

function restorePatchFromSnapshot(snapshot: Record<string, unknown>, fallbackBodyDoc: unknown) {
  const allowed = [
    "title",
    "bodyDoc",
    "materialsDoc",
    "videoUrl",
    "videoProvider",
    "videoMediaId",
    "isPreview",
    "requireVideoWatch",
    "autoComplete",
    "completionDelaySec",
    "minTimeSeconds",
    "showMarkComplete",
    "lessonDripMode",
    "lessonDripOffsetDays",
    "lessonDripDate",
  ];
  if (snapshot.values || snapshot.unsetFields) {
    const values = (snapshot.values ?? {}) as Record<string, unknown>;
    const unsetFields = Array.isArray(snapshot.unsetFields) ? snapshot.unsetFields : [];
    const patch: Record<string, unknown> = Object.fromEntries(
      allowed
        .filter((field) => Object.prototype.hasOwnProperty.call(values, field))
        .map((field) => [field, values[field]]),
    );
    for (const field of unsetFields) {
      if (allowed.includes(String(field))) patch[String(field)] = undefined;
    }
    if (!Object.prototype.hasOwnProperty.call(patch, "bodyDoc")) {
      patch.bodyDoc = fallbackBodyDoc;
    }
    return patch;
  }
  const restored = Object.keys(snapshot).length > 0 ? snapshot : { bodyDoc: fallbackBodyDoc };
  return Object.fromEntries(
    allowed
      .filter((field) => Object.prototype.hasOwnProperty.call(restored, field))
      .map((field) => [field, restored[field]]),
  );
}
