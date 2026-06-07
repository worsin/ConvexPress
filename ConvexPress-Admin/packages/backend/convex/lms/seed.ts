/**
 * LMS paid-tester seed data.
 *
 * Internal-only and idempotent: replaces only records with the seed LMS slugs
 * below, leaving real customer/admin-authored courses alone.
 */

// @ts-nocheck TS2589: Convex generated API union types exceed TypeScript instantiation depth.
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalMutation } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { detectVideoProvider, textToDoc } from "./lessons/helpers";

type AnyCtx = any;

const SEED_COURSE_SLUGS = [
  "seed-lms-free-orientation",
  "seed-lms-member-workshop",
  "seed-lms-certificate-track",
  "seed-lms-drip-linear",
] as const;

const SEED_CERT_SERIAL = "CERT-LMS-SEED-2026";

async function getSeedUserId(ctx: AnyCtx): Promise<Id<"users">> {
  const users = await ctx.db.query("users").collect();
  const activeUser =
    users.find((user: { status?: string; roleId?: Id<"roles"> }) => user.status === "active") ??
    users[0];
  if (!activeUser) {
    throw new Error("No user exists for LMS seed data");
  }
  return activeUser._id;
}

async function upsertPluginSettings(ctx: AnyCtx, userId: Id<"users">) {
  const existing = await ctx.db
    .query("settings")
    .withIndex("by_section", (q: AnyCtx) => q.eq("section", "plugins"))
    .unique();
  const values = {
    ...existing?.values,
    lmsEnabled: true,
    membershipEnabled: true,
  };
  if (existing) {
    await ctx.db.patch(existing._id, {
      values,
      updatedAt: Date.now(),
      updatedBy: userId,
    });
    return;
  }
  await ctx.db.insert("settings", {
    section: "plugins",
    values,
    updatedAt: Date.now(),
    updatedBy: userId,
  });
}

async function deleteRowsByCourse(ctx: AnyCtx, table: string, courseId: Id<"lms_courses">) {
  const rows = await ctx.db
    .query(table)
    .withIndex("by_course", (q: AnyCtx) => q.eq("courseId", courseId))
    .collect();
  for (const row of rows) {
    await ctx.db.delete(row._id);
  }
}

async function deleteSeedCourse(ctx: AnyCtx, slug: string) {
  const course = await ctx.db
    .query("lms_courses")
    .withIndex("by_slug", (q: AnyCtx) => q.eq("slug", slug))
    .first();
  if (!course) return;

  await deleteRowsByCourse(ctx, "lms_nodes", course._id);
  await deleteRowsByCourse(ctx, "lms_progress", course._id);
  await deleteRowsByCourse(ctx, "lms_enrollments", course._id);
  await deleteRowsByCourse(ctx, "lms_course_completions", course._id);
  await deleteRowsByCourse(ctx, "lms_certificate_issues", course._id);
  await deleteRowsByCourse(ctx, "lms_ai_generations", course._id);
  await deleteRowsByCourse(ctx, "lms_jobs", course._id);

  const prereqs = await ctx.db
    .query("lms_course_prerequisites")
    .withIndex("by_course", (q: AnyCtx) => q.eq("courseId", course._id))
    .collect();
  for (const prereq of prereqs) await ctx.db.delete(prereq._id);

  const inversePrereqs = await ctx.db
    .query("lms_course_prerequisites")
    .withIndex("by_prereq", (q: AnyCtx) => q.eq("prereqCourseId", course._id))
    .collect();
  for (const prereq of inversePrereqs) await ctx.db.delete(prereq._id);

  const rules = await ctx.db
    .query("membership_restriction_rules")
    .withIndex("by_resource", (q: AnyCtx) =>
      q.eq("resourceType", "course").eq("resourceIdOrKey", String(course._id)),
    )
    .collect();
  for (const rule of rules) await ctx.db.delete(rule._id);

  await ctx.db.delete(course._id);
}

async function ensurePlan(ctx: AnyCtx) {
  const now = Date.now();
  const existing = await ctx.db
    .query("membership_plans")
    .withIndex("by_slug", (q: AnyCtx) => q.eq("slug", "lms-paid-tester"))
    .first();

  const planId = existing
    ? (await ctx.db.patch(existing._id, {
        title: "LMS Paid Tester",
        description: "Seed membership plan for LMS restricted-course testing.",
        status: "active",
        grantMode: "manual",
        priority: 10,
        updatedAt: now,
      }),
      existing._id)
    : await ctx.db.insert("membership_plans", {
        title: "LMS Paid Tester",
        slug: "lms-paid-tester",
        description: "Seed membership plan for LMS restricted-course testing.",
        status: "active",
        grantMode: "manual",
        priority: 10,
        createdAt: now,
        updatedAt: now,
      });

  const benefits = await ctx.db
    .query("membership_plan_benefits")
    .withIndex("by_plan", (q: AnyCtx) => q.eq("planId", planId))
    .collect();
  if (!benefits.some((benefit: { code: string }) => benefit.code === "lms.seed.access")) {
    await ctx.db.insert("membership_plan_benefits", {
      planId,
      code: "lms.seed.access",
      label: "Seed LMS restricted course access",
      description: "Grants access to the member-only LMS seed course.",
      displayAsFeature: true,
      createdAt: now,
      updatedAt: now,
    });
  }

  return planId as Id<"membership_plans">;
}

async function ensureGrant(
  ctx: AnyCtx,
  userId: Id<"users">,
  planId: Id<"membership_plans">,
) {
  const now = Date.now();
  const grants = await ctx.db
    .query("membership_grants")
    .withIndex("by_user", (q: AnyCtx) => q.eq("userId", userId))
    .collect();
  const existing = grants.find((grant: { planId: Id<"membership_plans"> }) => grant.planId === planId);
  if (existing) {
    await ctx.db.patch(existing._id, {
      status: "active",
      sourceType: "manual",
      startsAt: now - 60_000,
      endsAt: now + 90 * 24 * 60 * 60 * 1000,
      updatedAt: now,
    });
    return existing._id;
  }
  return await ctx.db.insert("membership_grants", {
    userId,
    planId,
    sourceType: "manual",
    sourceRef: "lms-paid-tester-seed",
    status: "active",
    startsAt: now - 60_000,
    endsAt: now + 90 * 24 * 60 * 60 * 1000,
    metadata: { seededBy: "lms.seed.run" },
    createdAt: now,
    updatedAt: now,
  });
}

async function ensureCertificate(ctx: AnyCtx, userId: Id<"users">) {
  const now = Date.now();
  const existing = (await ctx.db.query("lms_certificates").collect()).find(
    (certificate: { title: string }) => certificate.title === "LMS Paid Tester Certificate",
  );
  if (existing) {
    await ctx.db.patch(existing._id, {
      templateDoc: textToDoc(
        "Certificate of Completion\n\nAwarded to {{learner_name}} for completing {{course_title}}.",
      ),
      orientation: "landscape",
      isActive: true,
      updatedAt: now,
    });
    return existing._id as Id<"lms_certificates">;
  }
  return (await ctx.db.insert("lms_certificates", {
    title: "LMS Paid Tester Certificate",
    templateDoc: textToDoc(
      "Certificate of Completion\n\nAwarded to {{learner_name}} for completing {{course_title}}.",
    ),
    orientation: "landscape",
    isActive: true,
    createdBy: userId,
    createdAt: now,
    updatedAt: now,
  })) as Id<"lms_certificates">;
}

async function createCourse(
  ctx: AnyCtx,
  userId: Id<"users">,
  input: {
    title: string;
    slug: string;
    excerpt: string;
    accessMode: "free" | "members" | "open";
    certificateId?: Id<"lms_certificates">;
    progressionMode?: "linear" | "free_form";
    startDate?: number;
    endDate?: number;
  },
) {
  const now = Date.now();
  return (await ctx.db.insert("lms_courses", {
    title: input.title,
    slug: input.slug,
    excerpt: input.excerpt,
    descriptionDoc: textToDoc(input.excerpt),
    status: "published",
    accessMode: input.accessMode,
    progressionMode: input.progressionMode ?? "linear",
    contentVisibility: "enrollees_only",
    categoryIds: ["seed-lms"],
    tagIds: ["paid-tester", input.accessMode],
    certificateId: input.certificateId,
    startDate: input.startDate,
    endDate: input.endDate,
    topicCount: 0,
    lessonCount: 0,
    authorId: userId,
    createdAt: now,
    updatedAt: now,
    publishedAt: now,
  })) as Id<"lms_courses">;
}

async function addTopic(
  ctx: AnyCtx,
  courseId: Id<"lms_courses">,
  position: number,
  title: string,
  options: {
    description?: string;
    dripMode?: "immediately" | "enrollment_based" | "specific_date";
    dripOffsetDays?: number;
    dripDate?: number;
  } = {},
) {
  const now = Date.now();
  return (await ctx.db.insert("lms_nodes", {
    courseId,
    kind: "topic",
    title,
    position,
    description: options.description,
    topicDripMode: options.dripMode,
    topicDripOffsetDays: options.dripOffsetDays,
    topicDripDate: options.dripDate,
    createdAt: now,
    updatedAt: now,
  })) as Id<"lms_nodes">;
}

async function addLesson(
  ctx: AnyCtx,
  courseId: Id<"lms_courses">,
  parentId: Id<"lms_nodes">,
  position: number,
  title: string,
  options: {
    body?: string;
    materials?: string;
    isPreview?: boolean;
    videoUrl?: string;
    requireVideoWatch?: boolean;
    autoComplete?: boolean;
    minTimeSeconds?: number;
    dripMode?: "immediately" | "enrollment_based" | "specific_date";
    dripOffsetDays?: number;
    dripDate?: number;
  } = {},
) {
  const now = Date.now();
  return (await ctx.db.insert("lms_nodes", {
    courseId,
    parentId,
    kind: "lesson",
    title,
    position,
    bodyDoc: textToDoc(
      options.body ??
        `This seeded lesson verifies LMS rendering, progress tracking, and completion for ${title}.`,
    ),
    materialsDoc: options.materials ? textToDoc(options.materials) : undefined,
    videoUrl: options.videoUrl,
    videoProvider: options.videoUrl ? detectVideoProvider(options.videoUrl) : undefined,
    isPreview: options.isPreview,
    requireVideoWatch: options.requireVideoWatch,
    autoComplete: options.autoComplete,
    minTimeSeconds: options.minTimeSeconds,
    showMarkComplete: true,
    lessonDripMode: options.dripMode,
    lessonDripOffsetDays: options.dripOffsetDays,
    lessonDripDate: options.dripDate,
    createdAt: now,
    updatedAt: now,
  })) as Id<"lms_nodes">;
}

async function recountCourse(ctx: AnyCtx, courseId: Id<"lms_courses">) {
  const nodes = await ctx.db
    .query("lms_nodes")
    .withIndex("by_course", (q: AnyCtx) => q.eq("courseId", courseId))
    .collect();
  await ctx.db.patch(courseId, {
    topicCount: nodes.filter((node: { kind: string }) => node.kind === "topic").length,
    lessonCount: nodes.filter((node: { kind: string }) => node.kind === "lesson").length,
    updatedAt: Date.now(),
  });
}

async function enrollUser(
  ctx: AnyCtx,
  userId: Id<"users">,
  courseId: Id<"lms_courses">,
  source: "manual" | "membership_plan" = "manual",
  planId?: Id<"membership_plans">,
) {
  const now = Date.now();
  return await ctx.db.insert("lms_enrollments", {
    userId,
    courseId,
    source,
    membershipPlanId: planId,
    enrolledAt: now - 60_000,
    status: "active",
    createdAt: now,
    updatedAt: now,
  });
}

async function completeCourse(
  ctx: AnyCtx,
  userId: Id<"users">,
  courseId: Id<"lms_courses">,
  certificateId: Id<"lms_certificates">,
) {
  const now = Date.now();
  const lessons = await ctx.db
    .query("lms_nodes")
    .withIndex("by_course_kind", (q: AnyCtx) => q.eq("courseId", courseId).eq("kind", "lesson"))
    .collect();
  for (const lesson of lessons) {
    await ctx.db.insert("lms_progress", {
      userId,
      courseId,
      nodeId: lesson._id,
      completed: true,
      completedAt: now,
      videoWatchedFraction: 1,
      timeSpentSec: 120,
      firstSeenAt: now - 120_000,
      lastSeenAt: now,
    });
  }
  await ctx.db.insert("lms_course_completions", {
    userId,
    courseId,
    completedAt: now,
    percent: 100,
    pointsEarned: 10,
  });
  const issueId = await ctx.db.insert("lms_certificate_issues", {
    userId,
    courseId,
    certificateId,
    serial: SEED_CERT_SERIAL,
    issuedAt: now,
    status: "issued",
  });
  await ctx.scheduler.runAfter(0, (internal as any).lms.certificates.actions.renderCertificatePdf, {
    issueId,
  });
}

export const run = internalMutation({
  args: {
    reset: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await getSeedUserId(ctx);
    await upsertPluginSettings(ctx, userId);

    if (args.reset !== false) {
      for (const slug of SEED_COURSE_SLUGS) {
        await deleteSeedCourse(ctx, slug);
      }
    }

    const planId = await ensurePlan(ctx);
    await ensureGrant(ctx, userId, planId);
    const certificateId = await ensureCertificate(ctx, userId);
    const now = Date.now();

    const freeCourseId = await createCourse(ctx, userId, {
      title: "Seed LMS Free Orientation",
      slug: "seed-lms-free-orientation",
      excerpt: "A free enrollment course for catalog, landing, enrollment, and progress testing.",
      accessMode: "free",
    });
    const freeTopic = await addTopic(ctx, freeCourseId, 1, "Getting started");
    await addLesson(ctx, freeCourseId, freeTopic, 1, "Welcome and expectations", {
      isPreview: true,
      body: "Use this preview lesson to verify anonymous course landing behavior.",
    });
    await addLesson(ctx, freeCourseId, freeTopic, 2, "Complete your first lesson", {
      body: "This lesson is intended for mark-complete and next-lesson testing.",
      materials: "Checklist: enroll, open lesson, mark complete, continue.",
    });
    await recountCourse(ctx, freeCourseId);
    await enrollUser(ctx, userId, freeCourseId);

    const memberCourseId = await createCourse(ctx, userId, {
      title: "Seed LMS Member Workshop",
      slug: "seed-lms-member-workshop",
      excerpt: "A member-only course for membership restriction and upgrade CTA testing.",
      accessMode: "members",
    });
    const memberTopic = await addTopic(ctx, memberCourseId, 1, "Member-only module");
    await addLesson(ctx, memberCourseId, memberTopic, 1, "Restricted lesson", {
      body: "This lesson verifies membership-plan access and enrollment state.",
    });
    await recountCourse(ctx, memberCourseId);
    await enrollUser(ctx, userId, memberCourseId, "membership_plan", planId);
    await ctx.db.insert("membership_restriction_rules", {
      resourceType: "course",
      resourceIdOrKey: String(memberCourseId),
      ruleMode: "allow_only",
      planIds: [planId],
      requiredCapabilities: [],
      teaserMode: "custom_message",
      customMessage: "This seed course requires the LMS Paid Tester plan.",
      loginRequired: true,
      createdAt: now,
      updatedAt: now,
    });

    const certificateCourseId = await createCourse(ctx, userId, {
      title: "Seed LMS Certificate Track",
      slug: "seed-lms-certificate-track",
      excerpt: "A completed certificate course with a deterministic verification serial.",
      accessMode: "free",
      certificateId,
      progressionMode: "free_form",
    });
    const certTopic = await addTopic(ctx, certificateCourseId, 1, "Certificate requirements");
    await addLesson(ctx, certificateCourseId, certTopic, 1, "Completion criteria", {
      body: "This lesson is already completed by the seed user to verify certificate rendering.",
    });
    await addLesson(ctx, certificateCourseId, certTopic, 2, "Download and verify", {
      body: "Use the deterministic serial to verify public certificate lookup.",
    });
    await recountCourse(ctx, certificateCourseId);
    await enrollUser(ctx, userId, certificateCourseId);
    await completeCourse(ctx, userId, certificateCourseId, certificateId);

    const dripCourseId = await createCourse(ctx, userId, {
      title: "Seed LMS Drip + Linear Course",
      slug: "seed-lms-drip-linear",
      excerpt: "A linear course with enrollment-based and date-based unlock states.",
      accessMode: "free",
      progressionMode: "linear",
    });
    const dripTopic = await addTopic(ctx, dripCourseId, 1, "Unlock rules", {
      dripMode: "enrollment_based",
      dripOffsetDays: 0,
    });
    await addLesson(ctx, dripCourseId, dripTopic, 1, "Unlocked first lesson", {
      body: "This first lesson should be available immediately after enrollment.",
      minTimeSeconds: 1,
    });
    await addLesson(ctx, dripCourseId, dripTopic, 2, "Future drip lesson", {
      body: "This lesson should be locked until tomorrow unless staff previews it.",
      dripMode: "specific_date",
      dripDate: now + 24 * 60 * 60 * 1000,
    });
    await recountCourse(ctx, dripCourseId);
    await enrollUser(ctx, userId, dripCourseId);

    await ctx.db.insert("lms_course_prerequisites", {
      courseId: dripCourseId,
      prereqCourseId: freeCourseId,
      createdAt: now,
    });
    await ctx.db.patch(dripCourseId, { prereqMode: "all", updatedAt: now });

    return {
      ok: true,
      userId,
      planId,
      certificateId,
      certificateSerial: SEED_CERT_SERIAL,
      courses: {
        freeCourseId,
        memberCourseId,
        certificateCourseId,
        dripCourseId,
      },
    };
  },
});
