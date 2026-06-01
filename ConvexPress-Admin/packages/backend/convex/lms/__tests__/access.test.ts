// @ts-expect-error Convex backend tsconfig does not include Bun test globals.
import { describe, expect, test } from "bun:test";

import type { Id } from "../../_generated/dataModel";
import { issueCertificate, reissueIssue } from "../certificates/mutations";
import { verifyBySerial } from "../certificates/queries";
import { update as updateCourse, publish as publishCourse } from "../courses/mutations";
import { enroll } from "../enrollment/mutations";
import { canAccessCourse as queryCanAccessCourse } from "../enrollment/queries";
import { getLessonForPlayer } from "../lessons/queries";
import { getCourseTree, getNode } from "../nodes/queries";
import {
  markComplete,
  markIncomplete,
  recordHeartbeat,
} from "../progress/mutations";
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
  const filters: Array<{ field: string; value: unknown }> = [];
  const filtered = () =>
    rows.filter((row) =>
      filters.every(({ field, value }) => String(row[field]) === String(value)),
    );
  const query = {
    withIndex: (_name: string, collectFilters: (q: any) => unknown) => {
      const builder = {
        eq: (field: string, value: unknown) => {
          filters.push({ field, value });
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
      patch: async (docId: string, patch: Record<string, unknown>) => {
        for (const rows of Object.values(tables)) {
          const row = rows.find((candidate) => candidate._id === docId);
          if (row) {
            Object.assign(row, patch);
            return;
          }
        }
        throw new Error(`Unable to patch missing document ${docId}`);
      },
      delete: async (docId: string) => {
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
        email: "admin@example.com",
        emailVerified: true,
        roleId: "role_admin",
        status: "active",
        createdAt: now,
        updatedAt: now,
      },
      {
        _id: "user_learner",
        email: "learner@example.com",
        emailVerified: true,
        roleId: "role_learner",
        status: "active",
        createdAt: now,
        updatedAt: now,
      },
      {
        _id: "user_lms_viewer",
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

    await expect(
      (getLessonForPlayer as any)._handler(createCtx(tables, "user_lms_viewer"), {
        nodeId: id("lesson_draft"),
      }),
    ).resolves.toMatchObject({
      bodyText: "Draft body",
      node: { _id: "lesson_draft" },
    });

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
});

describe("LMS learner runtime mutations", () => {
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
      (markComplete as any)._handler(ctx, { nodeId: id("lesson_video") }),
    ).resolves.toMatchObject({
      completed: 1,
      percent: 100,
      total: 1,
    });
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
