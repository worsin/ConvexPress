// @ts-expect-error Convex backend tsconfig does not include Bun test globals.
import { describe, expect, test } from "bun:test";

import type { Id } from "../../_generated/dataModel";
import { writeLessonBody } from "../ai/internals";
import { applyLessonGeneration } from "../ai/mutations";
import { issueCertificate, reissueIssue } from "../certificates/mutations";
import { getMyIssue, verifyBySerial } from "../certificates/queries";
import {
  duplicate as duplicateCourse,
  update as updateCourse,
  publish as publishCourse,
  updateAccessRule,
} from "../courses/mutations";
import { getBySlug as getCourseBySlug, getCatalog } from "../courses/queries";
import { expireExpiredEnrollments } from "../enrollment/internals";
import { enroll, enrollByEmail } from "../enrollment/mutations";
import {
  canAccessNode as queryCanAccessNode,
  canAccessCourse as queryCanAccessCourse,
  getCourseUnlockSchedule,
  getEnrollment as queryGetEnrollment,
  listEnrolleesForCourse,
  listEnrollments,
  listMyEnrollments,
  listMyLearning,
} from "../enrollment/queries";
import { getLessonForPlayer, getLessonPublicView } from "../lessons/queries";
import { getCourseTree, getNode } from "../nodes/queries";
import {
  markComplete,
  markIncomplete,
  recordHeartbeat,
} from "../progress/mutations";
import { canComplete, getCourseProgress, getNodeProgress } from "../progress/queries";
import { getTopic } from "../topics/queries";
import {
  canUserAccessCourse,
  canUserAccessNode,
  linearProgressionSatisfied,
  prerequisitesSatisfied,
  resolveNodeUnlock,
} from "../access";

type Row = { _id: string; [key: string]: any };
type Tables = Record<string, Row[]>;

const ADMIN_ISSUER = "https://convexpress-admin.local";
const now = 1_800_000_000_000;
const LMS_ADMIN_CAPABILITIES = [
  "lms.course.view",
  "lms.course.create",
  "lms.course.edit",
  "lms.course.publish",
  "lms.course.delete",
  "lms.lesson.edit",
  "lms.lesson.delete",
  "lms.builder.manage",
  "lms.ai.generate",
  "lms.enroll.manage",
  "lms.certificate.manage",
  "lms.settings.manage",
];

function id<T extends string>(value: string): Id<T> {
  return value as Id<T>;
}

function createQuery(rows: Row[]) {
  const filters: Array<{ field: string; op: "eq" | "lt"; value: unknown }> = [];
  const filtered = () =>
    rows.filter((row) =>
      filters.every(({ field, op, value }) => {
        if (op === "lt") return typeof row[field] === "number" && row[field] < (value as number);
        return String(row[field]) === String(value);
      }),
    );
  const query = {
    withIndex: (_name: string, collectFilters: (q: any) => unknown) => {
      const builder = {
        eq: (field: string, value: unknown) => {
          filters.push({ field, op: "eq", value });
          return builder;
        },
        lt: (field: string, value: unknown) => {
          filters.push({ field, op: "lt", value });
          return builder;
        },
      };
      collectFilters(builder);
      return query;
    },
    collect: async () => filtered(),
    first: async () => (await query.collect())[0] ?? null,
    take: async (count: number) => filtered().slice(0, count),
    unique: async () => (await query.collect())[0] ?? null,
    order: () => query,
  };
  return query;
}

function createCtx(tables: Tables, subject: string | null = "user_learner") {
  return {
    auth: {
      getUserIdentity: async () =>
        subject
          ? {
              subject,
              tokenIdentifier: `${ADMIN_ISSUER}|${subject}`,
            }
          : null,
    },
    db: {
      get: async (...args: string[]) => {
        const wanted = args.length === 1 ? args[0] : args[1];
        for (const rows of Object.values(tables)) {
          const row = rows.find((candidate) => candidate._id === wanted);
          if (row) return row;
        }
        return null;
      },
      insert: async (table: string, doc: Record<string, unknown>) => {
        const rows = (tables[table] ??= []);
        const newId = `${table}_${rows.length + 1}`;
        rows.push({ _id: newId, ...doc });
        return newId;
      },
      patch: async (...args: any[]) => {
        const docId = args.length === 2 ? args[0] : args[1];
        const patch = args.length === 2 ? args[1] : args[2];
        for (const rows of Object.values(tables)) {
          const row = rows.find((candidate) => candidate._id === docId);
          if (row) {
            Object.assign(row, patch);
            return;
          }
        }
        throw new Error(`Unable to patch missing document ${docId}`);
      },
      delete: async (...args: any[]) => {
        const docId = args.length === 1 ? args[0] : args[1];
        for (const rows of Object.values(tables)) {
          const index = rows.findIndex((candidate) => candidate._id === docId);
          if (index >= 0) {
            rows.splice(index, 1);
            return;
          }
        }
      },
      query: (table: string) => createQuery(tables[table] ?? []),
    },
    scheduler: {
      runAfter: async () => null,
    },
  } as any;
}

function baseTables(overrides: Partial<Tables> = {}): Tables {
  const tables: Tables = {
    settings: [
      {
        _id: "settings_plugins",
        section: "plugins",
        values: {
          commerceEnabled: true,
          lmsEnabled: true,
          membershipEnabled: true,
        },
      },
    ],
    roles: [
      {
        _id: "role_admin",
        slug: "administrator",
        level: 100,
        capabilities: LMS_ADMIN_CAPABILITIES,
        status: "active",
      },
      {
        _id: "role_editor",
        slug: "editor",
        level: 80,
        capabilities: [
          "lms.course.view",
          "lms.course.create",
          "lms.course.edit",
          "lms.lesson.edit",
          "lms.builder.manage",
          "lms.ai.generate",
        ],
        status: "active",
      },
      {
        _id: "role_learner",
        slug: "subscriber",
        level: 20,
        capabilities: [],
        status: "active",
      },
      {
        _id: "role_lms_viewer",
        slug: "lms-viewer",
        level: 20,
        capabilities: ["lms.course.view"],
        status: "active",
      },
    ],
    users: [
      {
        _id: "user_admin",
        authSource: "local",
        email: "admin@example.com",
        emailVerified: true,
        roleId: "role_admin",
        status: "active",
        createdAt: now,
        updatedAt: now,
      },
      {
        _id: "user_learner",
        authSource: "local",
        email: "learner@example.com",
        emailVerified: true,
        roleId: "role_learner",
        status: "active",
        createdAt: now,
        updatedAt: now,
      },
      {
        _id: "user_lms_viewer",
        authSource: "local",
        email: "viewer@example.com",
        emailVerified: true,
        roleId: "role_lms_viewer",
        status: "active",
        createdAt: now,
        updatedAt: now,
      },
    ],
    lms_courses: [
      course("course_open", { accessMode: "open" }),
      course("course_free", { accessMode: "free" }),
      course("course_members", { accessMode: "members" }),
      course("course_closed", { accessMode: "closed" }),
      course("course_draft", { accessMode: "members", status: "draft" }),
      course("course_linear", { accessMode: "free", progressionMode: "linear" }),
      course("course_prereq", {
        accessMode: "free",
        prereqMode: "all",
      }),
      course("course_prereq_any", {
        accessMode: "free",
        prereqMode: "any",
      }),
    ],
    lms_nodes: [
      node("topic_linear", "course_linear", "topic", { position: 1 }),
      node("lesson_linear_1", "course_linear", "lesson", {
        parentId: "topic_linear",
        position: 1,
      }),
      node("lesson_linear_2", "course_linear", "lesson", {
        parentId: "topic_linear",
        position: 2,
      }),
      node("topic_members", "course_members", "topic", { position: 1 }),
      node("lesson_preview", "course_members", "lesson", {
        isPreview: true,
        parentId: "topic_members",
        position: 1,
      }),
      node("lesson_drip", "course_free", "lesson", {
        lessonDripMode: "enrollment_based",
        lessonDripOffsetDays: 3,
        position: 1,
      }),
      node("lesson_specific_date", "course_free", "lesson", {
        lessonDripDate: now + 10_000,
        lessonDripMode: "specific_date",
        position: 2,
      }),
    ],
    lms_enrollments: [],
    lms_progress: [],
    lms_course_completions: [],
    lms_course_prerequisites: [],
    membership_restriction_rules: [],
    membership_grants: [],
    membership_plans: [],
    lms_ai_generations: [],
    lms_jobs: [],
    lms_lessonVersions: [],
    lms_certificates: [],
    lms_certificate_issues: [],
    media: [],
    searchIndex: [],
    eventListeners: [],
    eventListenerExecutions: [],
    events: [],
    ...overrides,
  };

  return tables;
}

function course(_id: string, patch: Record<string, unknown> = {}): Row {
  return {
    _id,
    title: _id,
    slug: _id,
    status: "published",
    authorId: "user_admin",
    createdAt: now,
    updatedAt: now,
    ...patch,
  };
}

function node(
  _id: string,
  courseId: string,
  kind: "topic" | "lesson" | "section_heading",
  patch: Record<string, unknown> = {},
): Row {
  return {
    _id,
    courseId,
    kind,
    title: _id,
    position: 1,
    createdAt: now,
    updatedAt: now,
    ...patch,
  };
}

async function expectConvexCode(promise: Promise<unknown>, code: string) {
  try {
    await promise;
  } catch (error) {
    expect((error as any)?.data?.code ?? (error as any)?.code).toBe(code);
    return;
  }
  throw new Error(`Expected ConvexError code ${code}`);
}

describe("LMS access decisions", () => {
  test("allows anonymous access to open courses but requires login for free courses", async () => {
    const ctx = createCtx(baseTables(), null);

    await expect(
      canUserAccessCourse(ctx, { courseId: id("course_open") }),
    ).resolves.toMatchObject({
      allowed: true,
      reason: "open",
      requiresLogin: false,
    });

    await expect(
      canUserAccessCourse(ctx, { courseId: id("course_free") }),
    ).resolves.toMatchObject({
      allowed: false,
      reason: "login_required",
      requiresLogin: true,
    });
  });

  test("uses active enrollment as the learner access override", async () => {
    const ctx = createCtx(
      baseTables({
        lms_enrollments: [
          {
            _id: "enrollment_1",
            userId: "user_learner",
            courseId: "course_closed",
            source: "manual",
            status: "active",
            enrolledAt: now,
            createdAt: now,
            updatedAt: now,
          },
        ],
      }),
    );

    await expect(
      canUserAccessCourse(ctx, {
        courseId: id("course_closed"),
        userId: id("user_learner"),
      }),
    ).resolves.toMatchObject({
      allowed: true,
      enrollmentId: "enrollment_1",
      reason: "enrolled",
    });
  });

  test("evaluates membership rules and active grants for member courses", async () => {
    const restrictedTables = baseTables({
      membership_restriction_rules: [
        {
          _id: "rule_1",
          resourceType: "course",
          resourceIdOrKey: "course_members",
          ruleMode: "allow_only",
          planIds: ["plan_paid_tester"],
          teaserMode: "custom_message",
          loginRequired: true,
        },
      ],
    });

    await expect(
      canUserAccessCourse(createCtx(restrictedTables), {
        courseId: id("course_members"),
        userId: id("user_learner"),
      }),
    ).resolves.toMatchObject({
      allowed: false,
      matchingPlanIds: ["plan_paid_tester"],
      reason: "no_matching_plan",
    });

    const grantedTables = baseTables({
      membership_restriction_rules: restrictedTables.membership_restriction_rules,
      membership_grants: [
        {
          _id: "grant_1",
          userId: "user_learner",
          planId: "plan_paid_tester",
          status: "active",
          startsAt: now,
          createdAt: now,
          updatedAt: now,
        },
      ],
    });

    await expect(
      canUserAccessCourse(createCtx(grantedTables), {
        courseId: id("course_members"),
        userId: id("user_learner"),
      }),
    ).resolves.toMatchObject({
      allowed: true,
      matchingPlanIds: ["plan_paid_tester"],
      reason: "membership",
    });
  });

  test("requires configured membership rules for member courses", async () => {
    await expect(
      canUserAccessCourse(createCtx(baseTables()), {
        courseId: id("course_members"),
        userId: id("user_learner"),
      }),
    ).resolves.toMatchObject({
      allowed: false,
      reason: "membership_rule_missing",
    });
  });

  test("evaluates all and any course prerequisites from completions", async () => {
    const ctxAll = createCtx(
      baseTables({
        lms_course_prerequisites: [
          {
            _id: "prereq_1",
            courseId: "course_prereq",
            prereqCourseId: "course_open",
            createdAt: now,
          },
          {
            _id: "prereq_2",
            courseId: "course_prereq",
            prereqCourseId: "course_free",
            createdAt: now,
          },
        ],
        lms_course_completions: [
          {
            _id: "completion_1",
            userId: "user_learner",
            courseId: "course_open",
            percent: 100,
            completedAt: now,
          },
        ],
      }),
    );

    await expect(
      prerequisitesSatisfied(ctxAll, id("user_learner"), id("course_prereq")),
    ).resolves.toMatchObject({
      allowed: false,
      reason: "prerequisites_required",
    });

    const ctxAny = createCtx(
      baseTables({
        lms_course_prerequisites: [
          {
            _id: "prereq_any_1",
            courseId: "course_prereq_any",
            prereqCourseId: "course_open",
            createdAt: now,
          },
          {
            _id: "prereq_any_2",
            courseId: "course_prereq_any",
            prereqCourseId: "course_free",
            createdAt: now,
          },
        ],
        lms_course_completions: [
          {
            _id: "completion_any_1",
            userId: "user_learner",
            courseId: "course_open",
            percent: 100,
            completedAt: now,
          },
        ],
      }),
    );

    await expect(
      prerequisitesSatisfied(ctxAny, id("user_learner"), id("course_prereq_any")),
    ).resolves.toMatchObject({
      allowed: true,
      reason: "prerequisites_met",
    });
  });

  test("locks enrollment-based and date-based drip lessons until their unlock time", async () => {
    const tables = baseTables({
      lms_enrollments: [
        {
          _id: "enrollment_1",
          userId: "user_learner",
          courseId: "course_free",
          source: "manual",
          status: "active",
          enrolledAt: Date.now(),
          createdAt: now,
          updatedAt: now,
        },
      ],
    });
    const ctx = createCtx(tables);
    const dripLesson = tables.lms_nodes.find((row) => row._id === "lesson_drip");
    const dateLesson = tables.lms_nodes.find(
      (row) => row._id === "lesson_specific_date",
    );

    await expect(
      resolveNodeUnlock(ctx, id("user_learner"), dripLesson),
    ).resolves.toMatchObject({
      allowed: false,
      reason: "drip_locked",
    });
    await expect(
      resolveNodeUnlock(ctx, id("user_learner"), dateLesson),
    ).resolves.toMatchObject({
      allowed: false,
      reason: "drip_locked",
      unlockAt: now + 10_000,
    });
  });

  test("keeps anonymous open-course lessons behind future date drip locks", async () => {
    const tables = baseTables({
      lms_courses: [course("course_open_drip", { accessMode: "open" })],
      lms_nodes: [
        node("topic_open_drip", "course_open_drip", "topic", { position: 1 }),
        node("lesson_open_drip", "course_open_drip", "lesson", {
          parentId: "topic_open_drip",
          lessonDripMode: "specific_date",
          lessonDripDate: now + 60_000,
        }),
      ],
    });

    await expect(
      canUserAccessNode(createCtx(tables, null), {
        nodeId: id("lesson_open_drip"),
      }),
    ).resolves.toMatchObject({
      allowed: false,
      reason: "drip_locked",
      unlockAt: now + 60_000,
    });
  });

  test("enforces linear lesson progression after the first lesson", async () => {
    const tables = baseTables();
    const ctx = createCtx(tables);
    const secondLesson = tables.lms_nodes.find(
      (row) => row._id === "lesson_linear_2",
    );

    await expect(
      linearProgressionSatisfied(ctx, id("user_learner"), secondLesson),
    ).resolves.toMatchObject({
      allowed: false,
      reason: "previous_lesson_required",
    });

    const completedCtx = createCtx(
      baseTables({
        lms_progress: [
          {
            _id: "progress_1",
            userId: "user_learner",
            courseId: "course_linear",
            nodeId: "lesson_linear_1",
            completed: true,
          },
        ],
      }),
    );

    await expect(
      linearProgressionSatisfied(completedCtx, id("user_learner"), secondLesson),
    ).resolves.toMatchObject({
      allowed: true,
      reason: "linear_unlocked",
    });
  });

  test("returns a server-computed course unlock schedule for player outlines", async () => {
    await expect(
      (getCourseUnlockSchedule as any)._handler(createCtx(baseTables()), {
        courseId: id("course_linear"),
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        nodeId: "lesson_linear_1",
        allowed: true,
        reason: "free",
      }),
      expect.objectContaining({
        nodeId: "lesson_linear_2",
        allowed: false,
        reason: "previous_lesson_required",
      }),
    ]);
  });

  test("includes drip unlock timing in the course unlock schedule", async () => {
    const tables = baseTables({
      lms_courses: [course("course_open_drip", { accessMode: "open" })],
      lms_nodes: [
        node("topic_open_drip", "course_open_drip", "topic", { position: 1 }),
        node("lesson_open_drip", "course_open_drip", "lesson", {
          parentId: "topic_open_drip",
          lessonDripMode: "specific_date",
          lessonDripDate: now + 60_000,
          position: 1,
        }),
      ],
    });

    await expect(
      (getCourseUnlockSchedule as any)._handler(createCtx(tables, null), {
        courseId: id("course_open_drip"),
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        nodeId: "lesson_open_drip",
        allowed: false,
        reason: "drip_locked",
        unlockAt: now + 60_000,
      }),
    ]);
  });

  test("lets preview lessons bypass a denied course decision", async () => {
    await expect(
      canUserAccessNode(createCtx(baseTables()), {
        nodeId: id("lesson_preview"),
        userId: id("user_learner"),
      }),
    ).resolves.toMatchObject({
      allowed: true,
      reason: "preview",
    });
  });

  test("keeps preview lessons behind future date drip locks", async () => {
    const tables = baseTables({
      lms_nodes: [
        ...baseTables().lms_nodes.filter((row) => row._id !== "lesson_preview"),
        node("lesson_preview", "course_members", "lesson", {
          isPreview: true,
          parentId: "topic_members",
          lessonDripMode: "specific_date",
          lessonDripDate: now + 30_000,
          position: 1,
        }),
      ],
    });

    await expect(
      canUserAccessNode(createCtx(tables), {
        nodeId: id("lesson_preview"),
        userId: id("user_learner"),
      }),
    ).resolves.toMatchObject({
      allowed: false,
      reason: "drip_locked",
      unlockAt: now + 30_000,
    });
  });

  test("does not expose preview lessons from unpublished or archived courses", async () => {
    const tables = baseTables({
      lms_courses: [
        ...baseTables().lms_courses,
        course("course_archived", { accessMode: "members", status: "archived" }),
      ],
      lms_nodes: [
        ...baseTables().lms_nodes,
        node("topic_draft_preview", "course_draft", "topic", { position: 1 }),
        node("lesson_draft_preview", "course_draft", "lesson", {
          isPreview: true,
          parentId: "topic_draft_preview",
          position: 1,
          bodyDoc: {
            type: "doc",
            content: [{ type: "paragraph", content: [{ type: "text", text: "Draft preview" }] }],
          },
        }),
        node("topic_archived_preview", "course_archived", "topic", { position: 1 }),
        node("lesson_archived_preview", "course_archived", "lesson", {
          isPreview: true,
          parentId: "topic_archived_preview",
          position: 1,
        }),
      ],
    });

    await expect(
      canUserAccessNode(createCtx(tables), {
        nodeId: id("lesson_draft_preview"),
        userId: id("user_learner"),
      }),
    ).resolves.toMatchObject({
      allowed: false,
      reason: "not_published",
    });
    await expect(
      canUserAccessNode(createCtx(tables), {
        nodeId: id("lesson_archived_preview"),
        userId: id("user_learner"),
      }),
    ).resolves.toMatchObject({
      allowed: false,
      reason: "archived",
    });
    await expect(
      (getLessonPublicView as any)._handler(createCtx(tables), {
        nodeId: id("lesson_draft_preview"),
      }),
    ).resolves.toBeNull();
  });

  test("lets staff preview unpublished courses", async () => {
    await expect(
      canUserAccessCourse(createCtx(baseTables(), "user_admin"), {
        courseId: id("course_draft"),
      }),
    ).resolves.toMatchObject({
      allowed: true,
      reason: "staff_preview",
    });
  });

  test("does not apply staff preview rights to another learner's access decision", async () => {
    await expect(
      (queryCanAccessCourse as any)._handler(createCtx(baseTables(), "user_admin"), {
        courseId: id("course_draft"),
        userId: id("user_learner"),
      }),
    ).resolves.toMatchObject({
      allowed: false,
      reason: "not_published",
    });
  });

  test("uses LMS capabilities instead of role level for author preview reads", async () => {
    const tables = baseTables();
    tables.lms_nodes.push(
      node("topic_draft", "course_draft", "topic", { position: 1 }),
      node("lesson_draft", "course_draft", "lesson", {
        parentId: "topic_draft",
        position: 1,
        bodyDoc: {
          type: "doc",
          content: [{ type: "paragraph", content: [{ type: "text", text: "Draft body" }] }],
        },
      }),
    );

    await expect(
      (getCourseTree as any)._handler(createCtx(tables, "user_lms_viewer"), {
        courseId: id("course_draft"),
      }),
    ).resolves.toMatchObject({
      topics: [{ _id: "topic_draft", children: [{ _id: "lesson_draft" }] }],
    });

    const staffPayload = await (getLessonForPlayer as any)._handler(
      createCtx(tables, "user_lms_viewer"),
      {
        nodeId: id("lesson_draft"),
      },
    );
    expect(staffPayload).toMatchObject({
      bodyText: "Draft body",
      node: { _id: "lesson_draft" },
    });
    expect(staffPayload.bodyDoc).toMatchObject({ type: "doc" });
    expect(staffPayload.node.bodyDoc).toBeUndefined();
    expect(staffPayload.node.materialsDoc).toBeUndefined();

    await expect(
      (getLessonForPlayer as any)._handler(createCtx(tables), {
        nodeId: id("lesson_draft"),
      }),
    ).resolves.toBeNull();
  });

  test("keeps generic node reads from leaking lesson authoring payloads to learners", async () => {
    const tables = baseTables();
    tables.lms_nodes.push(
      node("lesson_public_sensitive", "course_free", "lesson", {
        bodyDoc: {
          type: "doc",
          content: [{ type: "paragraph", content: [{ type: "text", text: "Hidden body" }] }],
        },
        materialsDoc: {
          type: "doc",
          content: [{ type: "paragraph", content: [{ type: "text", text: "Private note" }] }],
        },
        transcriptText: "Internal transcript",
        aiVideoMediaId: "media_ai_video",
        videoUrl: "https://videos.example.test/private",
      }),
    );

    await expect(
      (getNode as any)._handler(createCtx(tables), {
        nodeId: id("lesson_public_sensitive"),
      }),
    ).resolves.toMatchObject({
      _id: "lesson_public_sensitive",
      title: "lesson_public_sensitive",
    });
    const payload = await (getNode as any)._handler(createCtx(tables), {
      nodeId: id("lesson_public_sensitive"),
    });
    expect(payload.bodyDoc).toBeUndefined();
    expect(payload.videoUrl).toBeUndefined();

    const lessonPayload = await (getLessonPublicView as any)._handler(createCtx(tables), {
      nodeId: id("lesson_public_sensitive"),
    });
    expect(lessonPayload.bodyDoc).toMatchObject({ type: "doc" });
    expect(lessonPayload.materialsDoc).toMatchObject({ type: "doc" });
    expect(lessonPayload.node.bodyDoc).toBeUndefined();
    expect(lessonPayload.node.materialsDoc).toBeUndefined();
    expect(lessonPayload.node.transcriptText).toBeUndefined();
    expect(lessonPayload.node.aiVideoMediaId).toBeUndefined();
    expect(lessonPayload.node.videoUrl).toBe("https://videos.example.test/private");
  });

  test("keeps topic authoring queries behind LMS staff capabilities", async () => {
    await expect(
      (getTopic as any)._handler(createCtx(baseTables()), {
        nodeId: id("topic_members"),
      }),
    ).resolves.toBeNull();

    await expect(
      (getTopic as any)._handler(createCtx(baseTables(), "user_lms_viewer"), {
        nodeId: id("topic_members"),
      }),
    ).resolves.toMatchObject({
      _id: "topic_members",
      kind: "topic",
    });
  });

  test("does not expose progress metadata for inaccessible courses or lessons", async () => {
    const tables = baseTables({
      lms_courses: [course("course_private_progress", { status: "draft" })],
      lms_nodes: [
        node("topic_private_progress", "course_private_progress", "topic", { position: 1 }),
        node("lesson_private_progress", "course_private_progress", "lesson", {
          parentId: "topic_private_progress",
          position: 1,
        }),
      ],
      lms_progress: [
        {
          _id: "progress_private",
          userId: "user_learner",
          courseId: "course_private_progress",
          nodeId: "lesson_private_progress",
          completed: true,
          completedAt: now,
        },
      ],
    });

    await expect(
      (getCourseProgress as any)._handler(createCtx(tables), {
        courseId: id("course_private_progress"),
      }),
    ).resolves.toMatchObject({
      percent: 0,
      total: 0,
      completedCount: 0,
      completedNodeIds: [],
      nextNodeId: null,
      topicProgress: [],
    });
    await expect(
      (getNodeProgress as any)._handler(createCtx(tables), {
        nodeId: id("lesson_private_progress"),
      }),
    ).resolves.toBeNull();
  });

  test("exposes completion redirect only through access-gated learner progress", async () => {
    const tables = baseTables({
      lms_courses: [
        course("course_redirect_progress", {
          accessMode: "free",
          completionRedirectUrl: "/thanks",
        }),
      ],
      lms_nodes: [
        node("topic_redirect_progress", "course_redirect_progress", "topic", { position: 1 }),
        node("lesson_redirect_progress", "course_redirect_progress", "lesson", {
          parentId: "topic_redirect_progress",
          position: 1,
        }),
      ],
      lms_progress: [
        {
          _id: "progress_redirect",
          userId: "user_learner",
          courseId: "course_redirect_progress",
          nodeId: "lesson_redirect_progress",
          completed: true,
          completedAt: now,
        },
      ],
    });

    await expect(
      (getCourseProgress as any)._handler(createCtx(tables), {
        courseId: id("course_redirect_progress"),
      }),
    ).resolves.toMatchObject({
      percent: 100,
      total: 1,
      completedCount: 1,
      completionRedirectUrl: "/thanks",
    });
  });

  test("filters stale lesson ids out of course progress summaries", async () => {
    const tables = baseTables({
      lms_courses: [course("course_progress_filter", { accessMode: "free" })],
      lms_nodes: [
        node("topic_progress_filter", "course_progress_filter", "topic", { position: 1 }),
        node("lesson_progress_filter_1", "course_progress_filter", "lesson", {
          parentId: "topic_progress_filter",
          position: 1,
        }),
        node("lesson_progress_filter_2", "course_progress_filter", "lesson", {
          parentId: "topic_progress_filter",
          position: 2,
        }),
      ],
      lms_progress: [
        {
          _id: "progress_filter_current",
          userId: "user_learner",
          courseId: "course_progress_filter",
          nodeId: "lesson_progress_filter_1",
          completed: true,
          completedAt: now,
        },
        {
          _id: "progress_filter_deleted",
          userId: "user_learner",
          courseId: "course_progress_filter",
          nodeId: "lesson_deleted",
          completed: true,
          completedAt: now,
        },
      ],
    });

    await expect(
      (getCourseProgress as any)._handler(createCtx(tables), {
        courseId: id("course_progress_filter"),
      }),
    ).resolves.toMatchObject({
      percent: 50,
      total: 2,
      completedCount: 1,
      completedNodeIds: ["lesson_progress_filter_1"],
    });
  });

  test("projects public course reads away from authoring-only fields", async () => {
    const tables = baseTables({
      lms_courses: [
        course("course_public_projection", {
          accessMode: "open",
          slug: "public-projection",
          descriptionDoc: {
            type: "doc",
            content: [{ type: "paragraph", content: [{ type: "text", text: "Public copy" }] }],
          },
          materialsDoc: {
            type: "doc",
            content: [{ type: "paragraph", content: [{ type: "text", text: "Private notes" }] }],
          },
          completionRedirectUrl: "https://example.com/after",
          authorId: "user_admin",
        }),
      ],
    });

    const payload = await (getCourseBySlug as any)._handler(createCtx(tables, null), {
      slug: "public-projection",
    });

    expect(payload).toMatchObject({
      _id: "course_public_projection",
      title: "course_public_projection",
      slug: "public-projection",
      accessMode: "open",
      descriptionDoc: {
        type: "doc",
      },
    });
    expect(payload.authorId).toBeUndefined();
    expect(payload.materialsDoc).toBeUndefined();
    expect(payload.completionRedirectUrl).toBeUndefined();
  });

  test("returns a paginated and sorted public catalog payload", async () => {
    const tables = baseTables({
      lms_courses: [
        course("course_catalog_alpha", {
          title: "Alpha",
          slug: "alpha",
          publishedAt: now + 1,
          categoryIds: ["ops"],
          tagIds: ["starter"],
        }),
        course("course_catalog_beta", {
          title: "Beta",
          slug: "beta",
          publishedAt: now + 2,
          categoryIds: ["ops"],
          tagIds: ["advanced"],
        }),
        course("course_catalog_gamma", {
          title: "Gamma",
          slug: "gamma",
          publishedAt: now + 3,
          categoryIds: ["engineering"],
        }),
      ],
      lms_enrollments: [
        {
          _id: "enrollment_catalog_beta_1",
          userId: "user_learner",
          courseId: "course_catalog_beta",
          source: "manual",
          status: "active",
          enrolledAt: now,
          createdAt: now,
          updatedAt: now,
        },
        {
          _id: "enrollment_catalog_beta_2",
          userId: "user_lms_viewer",
          courseId: "course_catalog_beta",
          source: "manual",
          status: "active",
          enrolledAt: now,
          createdAt: now,
          updatedAt: now,
        },
        {
          _id: "enrollment_catalog_alpha",
          userId: "user_learner",
          courseId: "course_catalog_alpha",
          source: "manual",
          status: "active",
          enrolledAt: now,
          createdAt: now,
          updatedAt: now,
        },
      ],
    });

    await expect(
      (getCatalog as any)._handler(createCtx(tables, null), {
        sort: "title_asc",
        page: 2,
        pageSize: 1,
      }),
    ).resolves.toMatchObject({
      total: 3,
      page: 2,
      pageSize: 1,
      totalPages: 3,
      items: [expect.objectContaining({ title: "Beta", slug: "beta" })],
    });

    await expect(
      (getCatalog as any)._handler(createCtx(tables, null), {
        sort: "popular",
        category: "ops",
        pageSize: 10,
      }),
    ).resolves.toMatchObject({
      total: 2,
      items: [
        expect.objectContaining({ title: "Beta" }),
        expect.objectContaining({ title: "Alpha" }),
      ],
    });
  });

  test("disabled LMS plugin closes public query wrappers and write paths", async () => {
    const tables = baseTables({
      settings: [
        {
          _id: "settings_plugins",
          section: "plugins",
          values: { lmsEnabled: false, membershipEnabled: true },
        },
      ],
    });

    await expect(
      (queryCanAccessCourse as any)._handler(createCtx(tables), {
        courseId: id("course_free"),
      }),
    ).resolves.toMatchObject({
      allowed: false,
      reason: "disabled",
    });

    await expectConvexCode(
      (enroll as any)._handler(createCtx(tables), {
        courseId: id("course_free"),
      }),
      "PLUGIN_DISABLED",
    );
  });

  test("blocks learners from querying another user's LMS access state", async () => {
    const tables = baseTables({
      users: [
        ...baseTables().users,
        {
          _id: "user_other",
          email: "other@example.com",
          emailVerified: true,
          roleId: "role_learner",
          status: "active",
          createdAt: now,
          updatedAt: now,
        },
      ],
      lms_enrollments: [
        {
          _id: "enrollment_other",
          userId: "user_other",
          courseId: "course_free",
          source: "manual",
          status: "active",
          enrolledAt: now,
          createdAt: now,
          updatedAt: now,
        },
      ],
    });

    await expectConvexCode(
      (queryCanAccessCourse as any)._handler(createCtx(tables), {
        courseId: id("course_free"),
        userId: id("user_other"),
      }),
      "FORBIDDEN",
    );
    await expectConvexCode(
      (queryCanAccessNode as any)._handler(createCtx(tables), {
        nodeId: id("lesson_linear_1"),
        userId: id("user_other"),
      }),
      "FORBIDDEN",
    );
    await expectConvexCode(
      (queryGetEnrollment as any)._handler(createCtx(tables), {
        courseId: id("course_free"),
        userId: id("user_other"),
      }),
      "FORBIDDEN",
    );

    await expect(
      (queryGetEnrollment as any)._handler(createCtx(tables, "user_admin"), {
        courseId: id("course_free"),
        userId: id("user_other"),
      }),
    ).resolves.toMatchObject({ _id: "enrollment_other" });
  });

  test("hides expired active enrollments from learner and admin enrollment lists", async () => {
    const realNow = Date.now();
    const tables = baseTables({
      users: [
        ...baseTables().users,
        {
          _id: "user_other",
          email: "other@example.com",
          emailVerified: true,
          roleId: "role_learner",
          status: "active",
          createdAt: now,
          updatedAt: now,
        },
      ],
      lms_enrollments: [
        {
          _id: "enrollment_expired",
          userId: "user_learner",
          courseId: "course_free",
          source: "manual",
          status: "active",
          enrolledAt: now,
          expiresAt: realNow - 60_000,
          createdAt: now,
          updatedAt: now,
        },
        {
          _id: "enrollment_current",
          userId: "user_other",
          courseId: "course_free",
          source: "manual",
          status: "active",
          enrolledAt: now,
          expiresAt: realNow + 60_000,
          createdAt: now,
          updatedAt: now,
        },
      ],
    });

    await expect(
      (queryGetEnrollment as any)._handler(createCtx(tables), {
        courseId: id("course_free"),
      }),
    ).resolves.toBeNull();
    await expect((listMyEnrollments as any)._handler(createCtx(tables))).resolves.toEqual([]);
    await expect((listMyLearning as any)._handler(createCtx(tables))).resolves.toEqual([]);
    await expect(
      (listEnrolleesForCourse as any)._handler(createCtx(tables, "user_admin"), {
        courseId: id("course_free"),
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        enrollmentId: "enrollment_current",
        userId: "user_other",
      }),
    ]);
  });

  test("lets enrollment managers search global enrollment records by learner and course", async () => {
    const realNow = Date.now();
    const tables = baseTables({
      users: [
        ...baseTables().users,
        {
          _id: "user_other",
          displayName: "Pat Learner",
          email: "pat@example.com",
          emailVerified: true,
          roleId: "role_learner",
          status: "active",
          createdAt: now,
          updatedAt: now,
        },
      ],
      lms_courses: [
        course("course_global_active", { title: "Security Basics" }),
        course("course_global_expired", { title: "Old Compliance" }),
      ],
      lms_enrollments: [
        {
          _id: "enrollment_global_active",
          userId: "user_other",
          courseId: "course_global_active",
          source: "manual",
          status: "active",
          enrolledAt: now,
          expiresAt: realNow + 60_000,
          createdAt: now,
          updatedAt: now + 5,
        },
        {
          _id: "enrollment_global_overdue",
          userId: "user_learner",
          courseId: "course_global_expired",
          source: "manual",
          status: "active",
          enrolledAt: now - 10,
          expiresAt: realNow - 60_000,
          createdAt: now,
          updatedAt: now,
        },
      ],
    });

    await expect(
      (listEnrollments as any)._handler(createCtx(tables, "user_admin"), {
        status: "active",
        search: "pat",
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        enrollmentId: "enrollment_global_active",
        learnerName: "Pat Learner",
        courseTitle: "Security Basics",
        status: "active",
      }),
    ]);

    await expect(
      (listEnrollments as any)._handler(createCtx(tables, "user_admin"), {
        status: "expired",
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        enrollmentId: "enrollment_global_overdue",
        courseTitle: "Old Compliance",
        status: "expired",
      }),
    ]);
  });

  test("hides enrolled courses from learner lists when course access is blocked", async () => {
    const tables = baseTables({
      lms_courses: [
        course("course_visible_learning", {
          accessMode: "closed",
          title: "Visible Learning",
        }),
        course("course_draft_learning", {
          accessMode: "closed",
          status: "draft",
          title: "Draft Learning",
        }),
      ],
      lms_nodes: [],
      lms_enrollments: [
        {
          _id: "enrollment_visible_learning",
          userId: "user_learner",
          courseId: "course_visible_learning",
          source: "manual",
          status: "active",
          enrolledAt: now,
          createdAt: now,
          updatedAt: now,
        },
        {
          _id: "enrollment_draft_learning",
          userId: "user_learner",
          courseId: "course_draft_learning",
          source: "manual",
          status: "active",
          enrolledAt: now - 1,
          createdAt: now,
          updatedAt: now,
        },
      ],
    });

    await expect((listMyEnrollments as any)._handler(createCtx(tables))).resolves.toEqual([
      expect.objectContaining({
        enrollmentId: "enrollment_visible_learning",
        courseId: "course_visible_learning",
      }),
    ]);
    await expect((listMyLearning as any)._handler(createCtx(tables))).resolves.toEqual([
      expect.objectContaining({
        enrollmentId: "enrollment_visible_learning",
        courseId: "course_visible_learning",
      }),
    ]);
  });

  test("expires active enrollments whose access duration has elapsed", async () => {
    const realNow = Date.now();
    const tables = baseTables({
      lms_enrollments: [
        {
          _id: "enrollment_to_expire",
          userId: "user_learner",
          courseId: "course_free",
          source: "manual",
          status: "active",
          enrolledAt: now,
          expiresAt: realNow - 1_000,
          createdAt: now,
          updatedAt: now,
        },
        {
          _id: "enrollment_not_expired",
          userId: "user_learner",
          courseId: "course_open",
          source: "manual",
          status: "active",
          enrolledAt: now,
          expiresAt: realNow + 60_000,
          createdAt: now,
          updatedAt: now,
        },
        {
          _id: "enrollment_already_revoked",
          userId: "user_learner",
          courseId: "course_closed",
          source: "manual",
          status: "revoked",
          enrolledAt: now,
          expiresAt: realNow - 1_000,
          createdAt: now,
          updatedAt: now,
        },
      ],
    });

    await expect(
      (expireExpiredEnrollments as any)._handler(createCtx(tables), { limit: 10 }),
    ).resolves.toEqual({ expired: 1 });

    expect(tables.lms_enrollments.find((row) => row._id === "enrollment_to_expire")).toMatchObject({
      status: "expired",
    });
    expect(tables.lms_enrollments.find((row) => row._id === "enrollment_not_expired")).toMatchObject({
      status: "active",
    });
    expect(tables.lms_enrollments.find((row) => row._id === "enrollment_already_revoked")).toMatchObject({
      status: "revoked",
    });
    expect(tables.events).toHaveLength(1);
    expect(tables.events[0]).toMatchObject({
      code: "lms.enrollment_expired",
      system: "lms",
    });
    expect(JSON.parse(tables.events[0].payload)).toMatchObject({
      courseId: "course_free",
      userId: "user_learner",
      enrollmentId: "enrollment_to_expire",
      expiresAt: realNow - 1_000,
    });
  });

  test("requires author/editor roles for course edits and editor roles for publishing", async () => {
    await expectConvexCode(
      (updateCourse as any)._handler(createCtx(baseTables()), {
        courseId: id("course_free"),
        title: "Learner should not edit",
      }),
      "FORBIDDEN",
    );

    await expectConvexCode(
      (publishCourse as any)._handler(createCtx(baseTables()), {
        courseId: id("course_draft"),
      }),
      "FORBIDDEN",
    );
  });

  test("normalizes course URL and numeric settings on update", async () => {
    const tables = baseTables({
      lms_courses: [course("course_safe", { accessMode: "buy", authorId: "user_admin" })],
    });

    await (updateCourse as any)._handler(createCtx(tables, "user_admin"), {
      courseId: id("course_safe"),
      title: "Better Title",
      slug: "",
      externalButtonUrl: "javascript:alert(1)",
      promoVideoUrl: " https://youtube.com/watch?v=abc123 ",
      completionRedirectUrl: "/thanks",
      price: -15.5,
      recurringPrice: Number.NaN,
      billingInterval: -2,
      trialDays: 1.8,
      seatLimit: -4,
    });

    const courseRow = tables.lms_courses.find((row) => row._id === "course_safe");
    expect(courseRow?.title).toBe("Better Title");
    expect(courseRow?.slug).toBe("better-title");
    expect(courseRow?.externalButtonUrl).toBeUndefined();
    expect(courseRow?.promoVideoUrl).toBe("https://youtube.com/watch?v=abc123");
    expect(courseRow?.completionRedirectUrl).toBe("/thanks");
    expect(courseRow?.price).toBe(0);
    expect(courseRow?.recurringPrice).toBe(0);
    expect(courseRow?.billingInterval).toBe(1);
    expect(courseRow?.trialDays).toBe(1);
    expect(courseRow?.seatLimit).toBe(0);
  });

  test("duplicates course prerequisites and membership access rules", async () => {
    const tables = baseTables({
      lms_courses: [
        course("course_source", {
          accessMode: "members",
          prereqMode: "any",
          title: "Source Course",
          slug: "source-course",
          authorId: "user_admin",
        }),
        course("course_required", { title: "Required Course", slug: "required-course" }),
      ],
      lms_course_prerequisites: [
        {
          _id: "prereq_source",
          courseId: "course_source",
          prereqCourseId: "course_required",
          createdAt: now,
        },
      ],
      membership_plans: [
        {
          _id: "plan_gold",
          title: "Gold",
          slug: "gold",
          status: "active",
          grantMode: "manual",
          priority: 1,
          createdAt: now,
          updatedAt: now,
        },
      ],
      membership_restriction_rules: [
        {
          _id: "rule_source",
          resourceType: "course",
          resourceIdOrKey: "course_source",
          ruleMode: "allow_only",
          planIds: ["plan_gold"],
          requiredCapabilities: ["lms.special"],
          teaserMode: "custom_message",
          customMessage: "Gold members only",
          loginRequired: true,
          createdAt: now,
          updatedAt: now,
        },
      ],
    });

    const newId = await (duplicateCourse as any)._handler(createCtx(tables, "user_admin"), {
      courseId: id("course_source"),
    });

    expect(tables.lms_course_prerequisites).toContainEqual(
      expect.objectContaining({
        courseId: newId,
        prereqCourseId: "course_required",
      }),
    );
    expect(tables.membership_restriction_rules).toContainEqual(
      expect.objectContaining({
        resourceType: "course",
        resourceIdOrKey: String(newId),
        ruleMode: "allow_only",
        planIds: ["plan_gold"],
        requiredCapabilities: ["lms.special"],
        teaserMode: "custom_message",
        customMessage: "Gold members only",
        loginRequired: true,
      }),
    );
  });

  test("emits a course access event when deleting the membership access rule", async () => {
    const tables = baseTables({
      lms_courses: [course("course_access", { accessMode: "members", authorId: "user_admin" })],
      membership_restriction_rules: [
        {
          _id: "rule_access",
          resourceType: "course",
          resourceIdOrKey: "course_access",
          ruleMode: "allow_only",
          planIds: ["plan_gold"],
          requiredCapabilities: [],
          teaserMode: "custom_message",
          customMessage: "Members only",
          loginRequired: true,
          createdAt: now,
          updatedAt: now,
        },
      ],
    });

    await expect(
      (updateAccessRule as any)._handler(createCtx(tables, "user_admin"), {
        courseId: id("course_access"),
        planIds: [],
      }),
    ).resolves.toEqual({ ruleId: null, deleted: true });

    expect(tables.membership_restriction_rules).toHaveLength(0);
    expect(tables.events).toHaveLength(1);
    expect(tables.events[0]).toMatchObject({
      code: "lms.course_access_updated",
      system: "lms",
    });
    expect(JSON.parse(tables.events[0].payload)).toMatchObject({
      courseId: "course_access",
      planCount: 0,
      deleted: true,
    });
  });
});

describe("LMS learner runtime mutations", () => {
  test("blocks stale AI draft application before it overwrites lesson body", async () => {
    const tables = baseTables({
      lms_courses: [course("course_ai", { accessMode: "free", authorId: "user_admin" })],
      lms_nodes: [
        node("lesson_ai", "course_ai", "lesson", {
          bodyDoc: {
            type: "doc",
            content: [{ type: "paragraph", content: [{ type: "text", text: "Current body" }] }],
          },
          updatedAt: now + 100,
        }),
      ],
      lms_ai_generations: [
        {
          _id: "generation_ai",
          targetType: "node",
          targetId: "lesson_ai",
          courseId: "course_ai",
          stage: "lesson_body",
          model: "configured-ai-provider",
          prompt: "Improve this lesson",
          briefJson: { generatedBody: "Generated body" },
          label: "ai_assisted",
          reviewStatus: "unreviewed",
          createdAt: now,
        },
      ],
    });

    await expectConvexCode(
      (applyLessonGeneration as any)._handler(createCtx(tables, "user_admin"), {
        generationId: id("generation_ai"),
        nodeId: id("lesson_ai"),
        expectedUpdatedAt: now,
      }),
      "EDIT_CONFLICT",
    );

    const lesson = tables.lms_nodes.find((row) => row._id === "lesson_ai");
    expect(lesson?.bodyDoc?.content?.[0]?.content?.[0]?.text).toBe("Current body");
    expect(tables.lms_lessonVersions).toHaveLength(0);
    expect(tables.lms_ai_generations[0].reviewStatus).toBe("unreviewed");
  });

  test("applies reviewed AI drafts only after keeping a restorable lesson revision", async () => {
    const tables = baseTables({
      lms_courses: [course("course_ai", { accessMode: "free", authorId: "user_admin" })],
      lms_nodes: [
        node("lesson_ai", "course_ai", "lesson", {
          bodyDoc: {
            type: "doc",
            content: [{ type: "paragraph", content: [{ type: "text", text: "Current body" }] }],
          },
          updatedAt: now,
        }),
      ],
      lms_ai_generations: [
        {
          _id: "generation_ai",
          targetType: "node",
          targetId: "lesson_ai",
          courseId: "course_ai",
          stage: "lesson_body",
          model: "configured-ai-provider",
          prompt: "Improve this lesson",
          briefJson: { generatedBody: "Generated body" },
          label: "ai_assisted",
          reviewStatus: "unreviewed",
          createdAt: now,
        },
      ],
    });

    await expect(
      (applyLessonGeneration as any)._handler(createCtx(tables, "user_admin"), {
        generationId: id("generation_ai"),
        nodeId: id("lesson_ai"),
        expectedUpdatedAt: now,
      }),
    ).resolves.toMatchObject({
      ok: true,
      changedFields: ["bodyDoc"],
    });

    const lesson = tables.lms_nodes.find((row) => row._id === "lesson_ai");
    expect(lesson?.bodyDoc?.content?.[0]?.content?.[0]?.text).toBe("Generated body");
    expect(tables.lms_lessonVersions[0]).toMatchObject({
      nodeId: "lesson_ai",
      editedBy: "user_admin",
    });
    expect(tables.lms_ai_generations[0]).toMatchObject({
      reviewStatus: "reviewed",
      reviewedBy: "user_admin",
    });
  });

  test("stores background AI lesson bodies as drafts when a lesson changed after queueing", async () => {
    const tables = baseTables({
      lms_courses: [course("course_ai", { accessMode: "free", authorId: "user_admin" })],
      lms_nodes: [
        node("lesson_ai", "course_ai", "lesson", {
          bodyDoc: {
            type: "doc",
            content: [{ type: "paragraph", content: [{ type: "text", text: "Human edit" }] }],
          },
          updatedAt: now + 100,
        }),
      ],
      lms_ai_generations: [
        {
          _id: "generation_outline",
          targetType: "course",
          targetId: "course_ai",
          courseId: "course_ai",
          stage: "outline",
          model: "configured-ai-provider",
          prompt: "Build outline",
          briefJson: { outline: { topics: [] } },
          label: "ai_assisted",
          reviewStatus: "reviewed",
          reviewedBy: "user_admin",
          createdAt: now,
        },
      ],
      lms_jobs: [
        {
          _id: "job_ai",
          courseId: "course_ai",
          generationId: "generation_outline",
          kind: "lesson_body",
          targetId: "lesson_ai",
          status: "running",
          progress: 50,
          createdAt: now,
        },
      ],
    });

    await expect(
      (writeLessonBody as any)._handler(createCtx(tables, "user_admin"), {
        jobId: id("job_ai"),
        generationId: id("generation_outline"),
        nodeId: id("lesson_ai"),
        bodyText: "Generated replacement body.",
        prompt: "Write body",
      }),
    ).resolves.toEqual({ ok: true });

    const lesson = tables.lms_nodes.find((row) => row._id === "lesson_ai");
    expect(lesson?.bodyDoc?.content?.[0]?.content?.[0]?.text).toBe("Human edit");
    expect(tables.lms_jobs[0]).toMatchObject({ status: "done", progress: 100 });
    expect(tables.lms_ai_generations).toHaveLength(2);
    expect(tables.lms_ai_generations[1]).toMatchObject({
      targetType: "node",
      targetId: "lesson_ai",
      reviewStatus: "unreviewed",
      briefJson: {
        parentGenerationId: "generation_outline",
        generatedBody: "Generated replacement body.",
      },
    });
  });

  test("blocks enrollment when the course seat limit is full", async () => {
    const tables = baseTables({
      lms_courses: [
        course("course_limited", {
          accessMode: "free",
          seatLimit: 1,
        }),
      ],
      lms_enrollments: [
        {
          _id: "enrollment_full",
          userId: "user_other",
          courseId: "course_limited",
          source: "manual",
          status: "active",
          enrolledAt: now,
          createdAt: now,
          updatedAt: now,
        },
      ],
    });

    await expectConvexCode(
      (enroll as any)._handler(createCtx(tables), {
        courseId: id("course_limited"),
      }),
      "SEAT_LIMIT",
    );
  });

  test("blocks self-reactivating a revoked enrollment without current access", async () => {
    const tables = baseTables({
      lms_courses: [course("course_reactivation_closed", { accessMode: "closed" })],
      lms_enrollments: [
        {
          _id: "enrollment_reactivation_closed",
          userId: "user_learner",
          courseId: "course_reactivation_closed",
          source: "manual",
          status: "revoked",
          enrolledAt: now,
          createdAt: now,
          updatedAt: now,
        },
      ],
    });

    await expectConvexCode(
      (enroll as any)._handler(createCtx(tables), {
        courseId: id("course_reactivation_closed"),
      }),
      "ACCESS_DENIED",
    );
    expect(tables.lms_enrollments[0]).toMatchObject({
      status: "revoked",
    });
  });

  test("blocks reactivating a revoked enrollment when the course is full", async () => {
    const tables = baseTables({
      users: [
        ...baseTables().users,
        {
          _id: "user_other",
          email: "other@example.com",
          emailVerified: true,
          roleId: "role_learner",
          status: "active",
          createdAt: now,
          updatedAt: now,
        },
      ],
      lms_courses: [course("course_reactivation_limited", { accessMode: "free", seatLimit: 1 })],
      lms_enrollments: [
        {
          _id: "enrollment_reactivation_revoked",
          userId: "user_learner",
          courseId: "course_reactivation_limited",
          source: "manual",
          status: "revoked",
          enrolledAt: now,
          createdAt: now,
          updatedAt: now,
        },
        {
          _id: "enrollment_reactivation_active",
          userId: "user_other",
          courseId: "course_reactivation_limited",
          source: "manual",
          status: "active",
          enrolledAt: now,
          createdAt: now,
          updatedAt: now,
        },
      ],
    });

    await expectConvexCode(
      (enroll as any)._handler(createCtx(tables), {
        courseId: id("course_reactivation_limited"),
      }),
      "SEAT_LIMIT",
    );
    expect(tables.lms_enrollments[0]).toMatchObject({
      status: "revoked",
    });
  });

  test("admin email enrollment respects seat limits", async () => {
    const tables = baseTables({
      users: [
        ...baseTables().users,
        {
          _id: "user_other",
          email: "other@example.com",
          emailVerified: true,
          roleId: "role_learner",
          status: "active",
          createdAt: now,
          updatedAt: now,
        },
      ],
      lms_courses: [course("course_email_limited", { accessMode: "closed", seatLimit: 1 })],
      lms_enrollments: [
        {
          _id: "enrollment_email_active",
          userId: "user_other",
          courseId: "course_email_limited",
          source: "manual",
          status: "active",
          enrolledAt: now,
          createdAt: now,
          updatedAt: now,
        },
      ],
    });

    await expectConvexCode(
      (enrollByEmail as any)._handler(createCtx(tables, "user_admin"), {
        courseId: id("course_email_limited"),
        email: "learner@example.com",
      }),
      "SEAT_LIMIT",
    );
  });

  test("admin email enrollment applies access duration when reactivating", async () => {
    const tables = baseTables({
      lms_courses: [
        course("course_email_duration", {
          accessMode: "closed",
          accessDurationDays: 7,
        }),
      ],
      lms_enrollments: [
        {
          _id: "enrollment_email_duration",
          userId: "user_learner",
          courseId: "course_email_duration",
          source: "manual",
          status: "revoked",
          enrolledAt: now,
          createdAt: now,
          updatedAt: now,
        },
      ],
    });
    const before = Date.now();

    await expect(
      (enrollByEmail as any)._handler(createCtx(tables, "user_admin"), {
        courseId: id("course_email_duration"),
        email: "learner@example.com",
      }),
    ).resolves.toBe("enrollment_email_duration");
    const after = Date.now();

    expect(tables.lms_enrollments[0]).toMatchObject({
      status: "active",
      source: "manual",
    });
    expect(tables.lms_enrollments[0].enrolledAt).toBeGreaterThanOrEqual(before);
    expect(tables.lms_enrollments[0].enrolledAt).toBeLessThanOrEqual(after);
    expect(tables.lms_enrollments[0].expiresAt).toBeGreaterThanOrEqual(
      before + 7 * 24 * 60 * 60 * 1000,
    );
    expect(tables.lms_enrollments[0].expiresAt).toBeLessThanOrEqual(
      after + 7 * 24 * 60 * 60 * 1000,
    );
  });

  test("keeps enrollment idempotent by reactivating an existing row", async () => {
    const tables = baseTables({
      lms_courses: [course("course_free", { accessMode: "free" })],
      lms_enrollments: [
        {
          _id: "enrollment_existing",
          userId: "user_learner",
          courseId: "course_free",
          source: "manual",
          status: "revoked",
          enrolledAt: now,
          createdAt: now,
          updatedAt: now,
        },
      ],
    });

    await expect(
      (enroll as any)._handler(createCtx(tables), {
        courseId: id("course_free"),
      }),
    ).resolves.toBe("enrollment_existing");
    expect(tables.lms_enrollments[0]).toMatchObject({
      status: "active",
      source: "manual",
    });
  });

  test("rate-limits bursts of self-enrollment attempts", async () => {
    const tables = baseTables({
      lms_courses: [
        course("course_free", { accessMode: "free" }),
      ],
      lms_enrollments: Array.from({ length: 20 }).map((_, index) => ({
        _id: `enrollment_recent_${index}`,
        userId: "user_learner",
        courseId: `course_existing_${index}`,
        source: "manual",
        status: "active",
        enrolledAt: Date.now(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })),
    });

    await expectConvexCode(
      (enroll as any)._handler(createCtx(tables), {
        courseId: id("course_free"),
      }),
      "RATE_LIMITED",
    );
  });

  test("keeps active enrollment idempotency ahead of rate limiting", async () => {
    const tables = baseTables({
      lms_courses: [course("course_free", { accessMode: "free" })],
      lms_enrollments: [
        {
          _id: "enrollment_active_existing",
          userId: "user_learner",
          courseId: "course_free",
          source: "manual",
          status: "active",
          enrolledAt: Date.now(),
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        ...Array.from({ length: 20 }).map((_, index) => ({
          _id: `enrollment_recent_idempotent_${index}`,
          userId: "user_learner",
          courseId: `course_existing_idempotent_${index}`,
          source: "manual",
          status: "active",
          enrolledAt: Date.now(),
          createdAt: Date.now(),
          updatedAt: Date.now(),
        })),
      ],
    });

    await expect(
      (enroll as any)._handler(createCtx(tables), {
        courseId: id("course_free"),
      }),
    ).resolves.toBe("enrollment_active_existing");
  });

  test("requires video and time gates before manual completion", async () => {
    const tables = baseTables({
      lms_courses: [course("course_video", { accessMode: "free" })],
      lms_nodes: [
        node("lesson_video", "course_video", "lesson", {
          requireVideoWatch: true,
          minTimeSeconds: 30,
        }),
      ],
    });
    const ctx = createCtx(tables);

    await expect(
      (canComplete as any)._handler(ctx, { nodeId: id("lesson_video") }),
    ).resolves.toMatchObject({
      allowed: false,
      reason: "video_required",
      requiredWatchedFraction: 0.9,
      timeRemainingSec: 30,
    });

    await expectConvexCode(
      (markComplete as any)._handler(ctx, { nodeId: id("lesson_video") }),
      "VIDEO_REQUIRED",
    );

    await (recordHeartbeat as any)._handler(ctx, {
      nodeId: id("lesson_video"),
      timeSpentSec: 30,
      watchedFraction: 0.95,
    });

    await expect(
      (canComplete as any)._handler(ctx, { nodeId: id("lesson_video") }),
    ).resolves.toMatchObject({
      allowed: true,
      reason: "ready",
      timeRemainingSec: 0,
      videoRemainingFraction: 0,
    });

    await expect(
      (markComplete as any)._handler(ctx, { nodeId: id("lesson_video") }),
    ).resolves.toMatchObject({
      completed: 1,
      percent: 100,
      total: 1,
    });
  });

  test("ignores stale progress rows when recomputing course completion", async () => {
    const tables = baseTables({
      lms_courses: [course("course_stale_progress", { accessMode: "free" })],
      lms_nodes: [
        node("lesson_stale_progress_1", "course_stale_progress", "lesson"),
        node("lesson_stale_progress_2", "course_stale_progress", "lesson", { position: 2 }),
      ],
      lms_progress: [
        {
          _id: "progress_deleted_lesson",
          userId: "user_learner",
          courseId: "course_stale_progress",
          nodeId: "lesson_deleted",
          completed: true,
          completedAt: now,
        },
      ],
    });

    await expect(
      (markComplete as any)._handler(createCtx(tables), {
        nodeId: id("lesson_stale_progress_1"),
      }),
    ).resolves.toMatchObject({
      completed: 1,
      percent: 50,
      total: 2,
    });
    expect(tables.lms_course_completions).toHaveLength(0);
  });

  test("auto-completes on heartbeat and issues course certificates", async () => {
    const tables = baseTables({
      lms_courses: [
        course("course_auto", {
          accessMode: "free",
          certificateId: "certificate_1",
        }),
      ],
      lms_nodes: [
        node("lesson_auto", "course_auto", "lesson", {
          autoComplete: true,
          requireVideoWatch: true,
          minTimeSeconds: 30,
        }),
      ],
      lms_certificates: [
        {
          _id: "certificate_1",
          title: "Completion",
          templateDoc: {},
          orientation: "landscape",
          isActive: true,
          createdBy: "user_admin",
          createdAt: now,
          updatedAt: now,
        },
      ],
    });

    await expect(
      (recordHeartbeat as any)._handler(createCtx(tables), {
        nodeId: id("lesson_auto"),
        timeSpentSec: 30,
        watchedFraction: 0.95,
      }),
    ).resolves.toMatchObject({
      completed: 1,
      percent: 100,
      total: 1,
    });

    expect(tables.lms_progress[0]).toMatchObject({
      completed: true,
      courseId: "course_auto",
      nodeId: "lesson_auto",
      userId: "user_learner",
    });
    expect(tables.lms_course_completions[0]).toMatchObject({
      courseId: "course_auto",
      percent: 100,
      userId: "user_learner",
    });
    expect(tables.lms_certificate_issues[0]).toMatchObject({
      certificateId: "certificate_1",
      courseId: "course_auto",
      status: "issued",
      userId: "user_learner",
    });
  });

  test("revokes issued certificates when completion is rolled back", async () => {
    const tables = baseTables({
      lms_courses: [
        course("course_revoke", {
          accessMode: "free",
          certificateId: "certificate_1",
        }),
      ],
      lms_nodes: [node("lesson_revoke", "course_revoke", "lesson")],
      lms_progress: [
        {
          _id: "progress_revoke",
          userId: "user_learner",
          courseId: "course_revoke",
          nodeId: "lesson_revoke",
          completed: true,
          completedAt: now,
        },
      ],
      lms_course_completions: [
        {
          _id: "completion_revoke",
          userId: "user_learner",
          courseId: "course_revoke",
          percent: 100,
          completedAt: now,
        },
      ],
      lms_certificate_issues: [
        {
          _id: "issue_revoke",
          userId: "user_learner",
          courseId: "course_revoke",
          certificateId: "certificate_1",
          serial: "CERT-ROLLBACK",
          issuedAt: now,
          status: "issued",
        },
      ],
    });

    await expect(
      (markIncomplete as any)._handler(createCtx(tables), {
        nodeId: id("lesson_revoke"),
      }),
    ).resolves.toMatchObject({
      completed: 0,
      percent: 0,
      total: 1,
    });
    expect(tables.lms_certificate_issues[0]).toMatchObject({
      status: "revoked",
    });
  });

  test("blocks progress rollback when lesson access has expired", async () => {
    const tables = baseTables({
      lms_courses: [
        course("course_expired_rollback", {
          accessMode: "closed",
          certificateId: "certificate_1",
        }),
      ],
      lms_nodes: [node("lesson_expired_rollback", "course_expired_rollback", "lesson")],
      lms_enrollments: [
        {
          _id: "enrollment_expired_rollback",
          userId: "user_learner",
          courseId: "course_expired_rollback",
          source: "manual",
          status: "active",
          enrolledAt: now - 100_000,
          expiresAt: 1,
          createdAt: now,
          updatedAt: now,
        },
      ],
      lms_progress: [
        {
          _id: "progress_expired_rollback",
          userId: "user_learner",
          courseId: "course_expired_rollback",
          nodeId: "lesson_expired_rollback",
          completed: true,
          completedAt: now,
        },
      ],
      lms_course_completions: [
        {
          _id: "completion_expired_rollback",
          userId: "user_learner",
          courseId: "course_expired_rollback",
          percent: 100,
          completedAt: now,
        },
      ],
      lms_certificate_issues: [
        {
          _id: "issue_expired_rollback",
          userId: "user_learner",
          courseId: "course_expired_rollback",
          certificateId: "certificate_1",
          serial: "CERT-EXPIRED",
          issuedAt: now,
          status: "issued",
        },
      ],
    });

    await expectConvexCode(
      (markIncomplete as any)._handler(createCtx(tables), {
        nodeId: id("lesson_expired_rollback"),
      }),
      "ACCESS_DENIED",
    );

    expect(tables.lms_progress[0]).toMatchObject({
      completed: true,
      completedAt: now,
    });
    expect(tables.lms_certificate_issues[0]).toMatchObject({
      status: "issued",
    });
  });

  test("manual certificate issuance is idempotent after completion", async () => {
    const tables = baseTables({
      lms_courses: [
        course("course_certificate", {
          accessMode: "free",
          certificateId: "certificate_1",
        }),
      ],
      lms_course_completions: [
        {
          _id: "completion_certificate",
          userId: "user_learner",
          courseId: "course_certificate",
          percent: 100,
          completedAt: now,
        },
      ],
      lms_certificates: [
        {
          _id: "certificate_1",
          title: "Completion",
          templateDoc: {},
          orientation: "landscape",
          isActive: true,
          createdBy: "user_admin",
          createdAt: now,
          updatedAt: now,
        },
      ],
      lms_certificate_issues: [
        {
          _id: "issue_existing",
          userId: "user_learner",
          courseId: "course_certificate",
          certificateId: "certificate_1",
          serial: "CERT-EXISTING",
          issuedAt: now,
          status: "issued",
        },
      ],
    });

    await expect(
      (issueCertificate as any)._handler(createCtx(tables), {
        courseId: id("course_certificate"),
      }),
    ).resolves.toBe("issue_existing");
    expect(tables.lms_certificate_issues).toHaveLength(1);
  });

  test("manual certificate issuance reissues revoked certificates", async () => {
    const tables = baseTables({
      lms_courses: [
        course("course_reissue", {
          accessMode: "free",
          certificateId: "certificate_1",
        }),
      ],
      lms_course_completions: [
        {
          _id: "completion_reissue",
          userId: "user_learner",
          courseId: "course_reissue",
          percent: 100,
          completedAt: now,
        },
      ],
      lms_certificates: [
        {
          _id: "certificate_1",
          title: "Completion",
          templateDoc: {},
          orientation: "landscape",
          isActive: true,
          createdBy: "user_admin",
          createdAt: now,
          updatedAt: now,
        },
      ],
      lms_certificate_issues: [
        {
          _id: "issue_revoked",
          userId: "user_learner",
          courseId: "course_reissue",
          certificateId: "certificate_1",
          serial: "CERT-OLD",
          issuedAt: now,
          revokedAt: now,
          revocationReason: "Rollback",
          status: "revoked",
        },
      ],
    });

    await expect(
      (issueCertificate as any)._handler(createCtx(tables), {
        courseId: id("course_reissue"),
      }),
    ).resolves.toBe("issue_revoked");
    expect(tables.lms_certificate_issues[0]).toMatchObject({
      certificateId: "certificate_1",
      status: "issued",
    });
    expect(tables.lms_certificate_issues[0].serial).not.toBe("CERT-OLD");
  });

  test("public certificate verification renders PRD merge tokens and PDF links", async () => {
    const tables = baseTables({
      lms_courses: [
        course("course_certificate_aliases", {
          accessMode: "free",
          title: "Certificate Track",
          pointsAwarded: 42,
        }),
      ],
      lms_course_completions: [
        {
          _id: "completion_aliases",
          userId: "user_learner",
          courseId: "course_certificate_aliases",
          percent: 100,
          completedAt: now,
          pointsEarned: 42,
        },
      ],
      lms_certificates: [
        {
          _id: "certificate_aliases",
          title: "Mastery Certificate",
          templateDoc: textToDoc(
            "{{certificate_title}}\n\n{{learner_name}} completed {{course_title}} on {{completion_date}} for {{points}} points.\n\nSerial {{serial}}",
          ),
          orientation: "portrait",
          isActive: true,
          createdBy: "user_admin",
          createdAt: now,
          updatedAt: now,
        },
      ],
      lms_certificate_issues: [
        {
          _id: "issue_aliases",
          userId: "user_learner",
          courseId: "course_certificate_aliases",
          certificateId: "certificate_aliases",
          serial: "CERT-ALIAS-123456",
          pdfMediaId: "media_certificate_pdf",
          issuedAt: now,
          status: "issued",
        },
      ],
      media: [
        {
          _id: "media_certificate_pdf",
          url: "https://example.com/certificates/CERT-ALIAS-123456.pdf",
        },
      ],
    });
    const learner = tables.users.find((user) => user._id === "user_learner");
    if (learner) learner.displayName = "Pat Learner";

    const result = await (verifyBySerial as any)._handler(createCtx(tables, null), {
      serial: "cert-alias-123456",
    });
    expect(result).toMatchObject({
      valid: true,
      learnerName: "Pat Learner",
      courseTitle: "Certificate Track",
      certificateTitle: "Mastery Certificate",
      orientation: "portrait",
      pdfUrl: "https://example.com/certificates/CERT-ALIAS-123456.pdf",
    });
    expect(result.certificateText).toContain("Pat Learner completed Certificate Track");
    expect(result.certificateText).toContain("42 points");
    expect(result.certificateText).toContain("Serial CERT-ALIAS-123456");
  });

  test("learner certificate queries expose stored PDF download URLs", async () => {
    const tables = baseTables({
      lms_courses: [
        course("course_learner_pdf", {
          accessMode: "free",
          title: "Learner PDF Course",
        }),
      ],
      lms_nodes: [
        node("topic_learner_pdf", "course_learner_pdf", "topic", { position: 1 }),
        node("lesson_learner_pdf", "course_learner_pdf", "lesson", {
          parentId: "topic_learner_pdf",
          position: 1,
        }),
      ],
      lms_enrollments: [
        {
          _id: "enrollment_learner_pdf",
          userId: "user_learner",
          courseId: "course_learner_pdf",
          source: "manual",
          status: "active",
          enrolledAt: now,
        },
      ],
      lms_progress: [
        {
          _id: "progress_learner_pdf",
          userId: "user_learner",
          courseId: "course_learner_pdf",
          nodeId: "lesson_learner_pdf",
          completed: true,
          completedAt: now,
        },
      ],
      lms_certificate_issues: [
        {
          _id: "issue_learner_pdf",
          userId: "user_learner",
          courseId: "course_learner_pdf",
          certificateId: "certificate_learner_pdf",
          serial: "CERT-LEARNER-PDF",
          pdfMediaId: "media_learner_pdf",
          issuedAt: now,
          status: "issued",
        },
      ],
      media: [
        {
          _id: "media_learner_pdf",
          url: "https://example.com/certificates/CERT-LEARNER-PDF.pdf",
        },
      ],
    });

    await expect(
      (getMyIssue as any)._handler(createCtx(tables), {
        courseId: id("course_learner_pdf"),
      }),
    ).resolves.toMatchObject({
      serial: "CERT-LEARNER-PDF",
      pdfUrl: "https://example.com/certificates/CERT-LEARNER-PDF.pdf",
    });
    await expect((listMyLearning as any)._handler(createCtx(tables))).resolves.toEqual([
      expect.objectContaining({
        slug: "course_learner_pdf",
        certificateSerial: "CERT-LEARNER-PDF",
        certificatePdfUrl: "https://example.com/certificates/CERT-LEARNER-PDF.pdf",
      }),
    ]);
  });

  test("admins can explicitly reissue revoked certificate records", async () => {
    const tables = baseTables({
      lms_courses: [
        course("course_explicit_reissue", {
          accessMode: "free",
          certificateId: "certificate_1",
        }),
      ],
      lms_course_completions: [
        {
          _id: "completion_explicit_reissue",
          userId: "user_learner",
          courseId: "course_explicit_reissue",
          percent: 100,
          completedAt: now,
        },
      ],
      lms_certificates: [
        {
          _id: "certificate_1",
          title: "Completion",
          templateDoc: {},
          orientation: "landscape",
          isActive: true,
          createdBy: "user_admin",
          createdAt: now,
          updatedAt: now,
        },
      ],
      lms_certificate_issues: [
        {
          _id: "issue_explicit_reissue",
          userId: "user_learner",
          courseId: "course_explicit_reissue",
          certificateId: "certificate_1",
          serial: "CERT-OLD-EXPLICIT",
          pdfMediaId: "media_old_pdf",
          issuedAt: now,
          revokedAt: now,
          revokedBy: "user_admin",
          revocationReason: "Manual revoke",
          status: "revoked",
        },
      ],
    });

    await expect(
      (reissueIssue as any)._handler(createCtx(tables, "user_admin"), {
        issueId: id("issue_explicit_reissue"),
      }),
    ).resolves.toBe("issue_explicit_reissue");
    expect(tables.lms_certificate_issues[0]).toMatchObject({
      status: "issued",
      certificateId: "certificate_1",
    });
    expect(tables.lms_certificate_issues[0].serial).not.toBe("CERT-OLD-EXPLICIT");
    expect(tables.lms_certificate_issues[0].pdfMediaId).toBeUndefined();
    expect(tables.events[0]).toMatchObject({
      code: "lms.certificate_issued",
    });
  });
});

function textToDoc(text: string) {
  return {
    type: "doc",
    content: text.split(/\n{2,}/).map((block) => ({
      type: "paragraph",
      content: block ? [{ type: "text", text: block.replace(/\n/g, " ") }] : [],
    })),
  };
}
