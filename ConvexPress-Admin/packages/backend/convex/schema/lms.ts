/**
 * LMS Extension - Schema
 *
 * Courses → Topics → Lessons, AI-assisted authoring, membership-gated access.
 * The full domain is declared up front (incl. learner-surface + AI-media
 * tables) so fast-follow systems need no migration.
 *
 *   lms_courses              - Course entity + course-level settings
 *   lms_course_prerequisites - Course → prerequisite-course join
 *   lms_nodes                - Recursive curriculum tree (topic|lesson|section_heading)
 *   lms_lessonVersions       - Lesson body revision history
 *   lms_enrollments          - Learner enrollment (membership_plan|manual|purchase)
 *   lms_progress             - Per-learner per-node progress
 *   lms_course_completions   - Per-learner course completion
 *   lms_certificates         - Certificate templates
 *   lms_certificate_issues   - Issued certificates (verifiable)
 *   lms_ai_generations       - AI generation provenance (1EdTech fields)
 *   lms_jobs                 - Async generation job tracking
 */

import { defineTable } from "convex/server";
import { v } from "convex/values";

// ─── Shared Validators ───────────────────────────────────────────────

export const lmsCourseStatusValidator = v.union(
  v.literal("draft"),
  v.literal("published"),
  v.literal("archived"),
);

export const lmsAccessModeValidator = v.union(
  v.literal("open"),
  v.literal("free"),
  v.literal("members"),
  v.literal("buy"),
  v.literal("recurring"),
  v.literal("closed"),
);

export const lmsBillingUnitValidator = v.union(
  v.literal("day"),
  v.literal("week"),
  v.literal("month"),
  v.literal("year"),
);

export const lmsProgressionModeValidator = v.union(
  v.literal("linear"),
  v.literal("free_form"),
);

export const lmsContentVisibilityValidator = v.union(
  v.literal("always"),
  v.literal("enrollees_only"),
);

export const lmsPrereqModeValidator = v.union(
  v.literal("any"),
  v.literal("all"),
);

export const lmsNodeKindValidator = v.union(
  v.literal("topic"),
  v.literal("lesson"),
  v.literal("section_heading"),
);

export const lmsDripModeValidator = v.union(
  v.literal("immediately"),
  v.literal("enrollment_based"),
  v.literal("specific_date"),
);

export const lmsEnrollmentSourceValidator = v.union(
  v.literal("membership_plan"),
  v.literal("manual"),
  v.literal("purchase"),
);

export const lmsEnrollmentStatusValidator = v.union(
  v.literal("active"),
  v.literal("expired"),
  v.literal("revoked"),
);

export const lmsAiStageValidator = v.union(
  v.literal("outline"),
  v.literal("lesson_body"),
  v.literal("image"),
  v.literal("voiceover"),
  v.literal("captions"),
  v.literal("video"),
);

export const lmsAiLabelValidator = v.union(
  v.literal("fully_ai"),
  v.literal("ai_assisted"),
  v.literal("human"),
);

export const lmsAiReviewStatusValidator = v.union(
  v.literal("unreviewed"),
  v.literal("reviewed"),
);

export const lmsJobKindValidator = v.union(
  v.literal("outline"),
  v.literal("lesson_body"),
  v.literal("image"),
  v.literal("voiceover"),
  v.literal("captions"),
  v.literal("video"),
);

export const lmsJobStatusValidator = v.union(
  v.literal("queued"),
  v.literal("running"),
  v.literal("done"),
  v.literal("failed"),
);

// ─── Tables ──────────────────────────────────────────────────────────

export const lmsTables = {
  // ── Course ──────────────────────────────────────────────────────────
  lms_courses: defineTable({
    title: v.string(),
    slug: v.string(),
    descriptionDoc: v.optional(v.any()), // Tiptap JSON
    excerpt: v.optional(v.string()),
    status: lmsCourseStatusValidator,
    featuredImageId: v.optional(v.id("media")),
    promoVideoUrl: v.optional(v.string()),
    categoryIds: v.optional(v.array(v.string())), // taxonomy term ids
    tagIds: v.optional(v.array(v.string())),

    // Access / commerce — nullable now, enforced by Access & Enrollment later
    accessMode: v.optional(lmsAccessModeValidator),
    price: v.optional(v.number()),
    recurringPrice: v.optional(v.number()),
    billingInterval: v.optional(v.number()),
    billingUnit: v.optional(lmsBillingUnitValidator),
    trialPrice: v.optional(v.number()),
    trialDays: v.optional(v.number()),
    externalButtonUrl: v.optional(v.string()),

    // Progression / gating — stored now, enforced later
    progressionMode: v.optional(lmsProgressionModeValidator),
    pointsAwarded: v.optional(v.number()),
    pointsRequired: v.optional(v.number()),
    prereqMode: v.optional(lmsPrereqModeValidator),
    accessDurationDays: v.optional(v.number()),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    seatLimit: v.optional(v.number()),
    contentVisibility: v.optional(lmsContentVisibilityValidator),

    certificateId: v.optional(v.id("lms_certificates")),
    completionRedirectUrl: v.optional(v.string()),
    materialsDoc: v.optional(v.any()),

    // Denormalized counts (kept fresh on tree change)
    topicCount: v.optional(v.number()),
    lessonCount: v.optional(v.number()),

    authorId: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
    publishedAt: v.optional(v.number()),
  })
    .index("by_slug", ["slug"])
    .index("by_status", ["status"])
    .index("by_author", ["authorId"]),

  lms_course_prerequisites: defineTable({
    courseId: v.id("lms_courses"),
    prereqCourseId: v.id("lms_courses"),
    createdAt: v.number(),
  })
    .index("by_course", ["courseId"])
    .index("by_prereq", ["prereqCourseId"]),

  // ── Curriculum tree ─────────────────────────────────────────────────
  lms_nodes: defineTable({
    courseId: v.id("lms_courses"),
    parentId: v.optional(v.id("lms_nodes")),
    kind: lmsNodeKindValidator,
    title: v.string(),
    position: v.number(), // fractional ordering within parent

    // Topic-owned
    description: v.optional(v.string()),
    topicDripMode: v.optional(lmsDripModeValidator),
    topicDripOffsetDays: v.optional(v.number()),
    topicDripDate: v.optional(v.number()),

    // Lesson-owned
    bodyDoc: v.optional(v.any()), // Tiptap JSON
    materialsDoc: v.optional(v.any()),
    videoUrl: v.optional(v.string()),
    videoProvider: v.optional(v.string()),
    videoMediaId: v.optional(v.id("media")),
    requireVideoWatch: v.optional(v.boolean()),
    autoComplete: v.optional(v.boolean()),
    completionDelaySec: v.optional(v.number()),
    minTimeSeconds: v.optional(v.number()),
    showMarkComplete: v.optional(v.boolean()),
    isPreview: v.optional(v.boolean()),
    lessonDripMode: v.optional(lmsDripModeValidator),
    lessonDripOffsetDays: v.optional(v.number()),
    lessonDripDate: v.optional(v.number()),

    // AI media (declared now; populated by AI Lesson Media phase)
    audioMediaId: v.optional(v.id("media")),
    captionsMediaId: v.optional(v.id("media")),
    transcriptText: v.optional(v.string()),
    aiVideoMediaId: v.optional(v.id("media")),

    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_course", ["courseId"])
    .index("by_parent", ["parentId", "position"])
    .index("by_course_kind", ["courseId", "kind"]),

  lms_lessonVersions: defineTable({
    nodeId: v.id("lms_nodes"),
    bodyDoc: v.any(),
    snapshotJson: v.optional(v.any()),
    editedBy: v.id("users"),
    createdAt: v.number(),
  }).index("by_node", ["nodeId"]),

  // ── Learner surface (fast-follow; declared now) ─────────────────────
  lms_enrollments: defineTable({
    userId: v.id("users"),
    courseId: v.id("lms_courses"),
    source: lmsEnrollmentSourceValidator,
    membershipPlanId: v.optional(v.id("membership_plans")),
    sourceRef: v.optional(v.string()),
    enrolledAt: v.number(),
    expiresAt: v.optional(v.number()),
    status: lmsEnrollmentStatusValidator,
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId", "status"])
    .index("by_course", ["courseId", "status"])
    .index("by_user_course", ["userId", "courseId"]),

  lms_progress: defineTable({
    userId: v.id("users"),
    courseId: v.id("lms_courses"),
    nodeId: v.id("lms_nodes"),
    completed: v.boolean(),
    completedAt: v.optional(v.number()),
    videoWatchedFraction: v.optional(v.number()),
    timeSpentSec: v.optional(v.number()),
    firstSeenAt: v.optional(v.number()),
    lastSeenAt: v.optional(v.number()),
  })
    .index("by_user_course", ["userId", "courseId"])
    .index("by_user_node", ["userId", "nodeId"])
    .index("by_course", ["courseId"]),

  lms_course_completions: defineTable({
    userId: v.id("users"),
    courseId: v.id("lms_courses"),
    completedAt: v.number(),
    percent: v.number(),
    pointsEarned: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_course", ["courseId"]),

  // ── Certificates ────────────────────────────────────────────────────
  lms_certificates: defineTable({
    title: v.string(),
    templateDoc: v.any(), // Tiptap/HTML layout with merge tokens
    orientation: v.union(v.literal("landscape"), v.literal("portrait")),
    backgroundMediaId: v.optional(v.id("media")),
    isActive: v.boolean(),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_active", ["isActive"]),

  lms_certificate_issues: defineTable({
    userId: v.id("users"),
    courseId: v.id("lms_courses"),
    certificateId: v.id("lms_certificates"),
    serial: v.string(),
    pdfMediaId: v.optional(v.id("media")),
    issuedAt: v.number(),
    revokedAt: v.optional(v.number()),
    revokedBy: v.optional(v.id("users")),
    revocationReason: v.optional(v.string()),
    status: v.union(v.literal("issued"), v.literal("revoked")),
  })
    .index("by_user", ["userId"])
    .index("by_course", ["courseId"])
    .index("by_serial", ["serial"])
    .index("by_user_course", ["userId", "courseId"]),

  // ── AI generation provenance + jobs ─────────────────────────────────
  lms_ai_generations: defineTable({
    targetType: v.union(v.literal("course"), v.literal("node")),
    targetId: v.string(),
    courseId: v.id("lms_courses"),
    stage: lmsAiStageValidator,
    model: v.string(),
    modelVersion: v.optional(v.string()),
    prompt: v.string(),
    briefJson: v.optional(v.any()),
    sourcesJson: v.optional(v.any()),
    tokens: v.optional(v.number()),
    label: lmsAiLabelValidator,
    reviewStatus: lmsAiReviewStatusValidator,
    reviewedBy: v.optional(v.id("users")),
    reviewedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_course", ["courseId"])
    .index("by_target", ["targetType", "targetId"]),

  lms_jobs: defineTable({
    courseId: v.id("lms_courses"),
    generationId: v.optional(v.id("lms_ai_generations")),
    kind: lmsJobKindValidator,
    targetId: v.optional(v.string()),
    status: lmsJobStatusValidator,
    error: v.optional(v.string()),
    progress: v.optional(v.number()),
    startedAt: v.optional(v.number()),
    finishedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_course", ["courseId", "status"])
    .index("by_generation", ["generationId", "status"]),
};
