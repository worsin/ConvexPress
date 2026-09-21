import { expect, test } from "bun:test";
import { convexTest } from "convex-test";
import { api } from "../../_generated/api";
import schema from "../../schema";
import { prepareContentRestrictionCopy } from "../policyCopy";

const modules = {
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/posts/mutations.ts": () => import("../../posts/mutations"),
  "./convex/pages/queries.ts": () => import("../../pages/queries"),
  "./convex/membership/policyReads.ts": () => import("../policyReads"),
};
async function fixture(home = false) {
  const t = convexTest({ schema, modules });
  const ids = await t.run(async (ctx) => {
    const roleId = await ctx.db.insert("roles", {
      name: "Editor",
      slug: "editor",
      description: "Fixture",
      level: 80,
      type: "internal",
      status: "active",
      isDefault: false,
      isProtected: false,
      capabilities: ["post.duplicate", "page.update"],
      pageAccess: [],
      createdAt: 1,
      updatedAt: 1,
    });
    const editorId = await ctx.db.insert("users", {
      email: "editor@example.test",
      emailVerified: true,
      authSource: "local",
      roleId,
      status: "active",
      createdAt: 1,
      updatedAt: 1,
    });
    const readerId = await ctx.db.insert("users", {
      email: "reader@example.test",
      emailVerified: true,
      authSource: "local",
      status: "active",
      createdAt: 1,
      updatedAt: 1,
    });
    await ctx.db.insert("settings", {
      section: "plugins",
      values: { membershipEnabled: true },
      updatedAt: 1,
      updatedBy: editorId,
    });
    const postId = await ctx.db.insert("posts", {
      type: "page",
      title: "Private lesson",
      slug: "lesson",
      path: "/premium/lesson",
      content: "Protected authored body",
      status: "publish",
      visibility: "public",
      authorId: editorId,
      commentStatus: "closed",
      createdAt: 1,
      updatedAt: 1,
    });
    const plans = [];
    for (const slug of ["direct", "exact", "wildcard", "homepage"])
      plans.push(
        await ctx.db.insert("membership_plans", {
          title: slug,
          slug,
          status: "active",
          grantMode: "manual",
          priority: 0,
          createdAt: 1,
          updatedAt: 1,
        }),
      );
    for (const [resourceType, resourceIdOrKey, index] of [
      ["page", String(postId), 0],
      ["route", "/premium/lesson", 1],
      ["route", "/premium/*", 2],
      ...(home ? [["route", "/", 3] as const] : []),
    ] as const) {
      await ctx.db.insert("membership_restriction_rules", {
        resourceType,
        resourceIdOrKey,
        ruleMode: "allow_only",
        planIds: [plans[index]!],
        teaserMode: "excerpt",
        loginRequired: true,
        createdAt: 1,
        updatedAt: 1,
      });
    }
    if (home)
      await ctx.db.insert("settings", {
        section: "reading",
        values: { homepageDisplays: "static_page", homepageId: postId },
        updatedAt: 1,
        updatedBy: editorId,
      });
    return { editorId, readerId, postId, plans };
  });
  const editor = t.withIdentity({
    subject: ids.editorId,
    issuer: "https://convexpress-admin.local",
  });
  const reader = t.withIdentity({
    subject: ids.readerId,
    issuer: "https://convexpress-admin.local",
  });
  async function grant(index: number) {
    await t.run((ctx) =>
      ctx.db.insert("membership_grants", {
        userId: ids.readerId,
        planId: ids.plans[index]!,
        status: "active",
        sourceType: "manual",
        startsAt: 1,
        createdAt: 1,
        updatedAt: 1,
      }),
    );
  }
  return { t, editor, reader, grant, ...ids };
}

test("real duplicate and public reads preserve direct AND (exact OR wildcard) route plans", async () => {
  const f = await fixture();
  const copyId = await f.editor.mutation(api.posts.mutations.duplicate, {
    postId: f.postId,
  });
  const copy = await f.t.run(async (ctx) => {
    await ctx.db.patch(copyId, { status: "publish" });
    return (await ctx.db.get(copyId))!;
  });
  expect(
    (await f.t.query(api.pages.queries.getByPath, { path: copy.path! }))
      ?.content,
  ).toBeUndefined();
  await f.grant(0);
  expect(
    (await f.reader.query(api.pages.queries.getByPath, { path: copy.path! }))
      ?.content,
  ).toBeUndefined();
  await f.grant(2);
  expect(
    (await f.reader.query(api.pages.queries.getByPath, { path: copy.path! }))
      ?.content,
  ).toBe("Protected authored body");
  expect(
    (
      await f.reader.query(api.pages.queries.getByPath, {
        path: "/premium/lesson",
      })
    )?.content,
  ).toBe("Protected authored body");
});

test("homepage alias adds an independent group and repeated duplication keeps all source groups", async () => {
  const f = await fixture(true);
  const first = await f.editor.mutation(api.posts.mutations.duplicate, {
    postId: f.postId,
  });
  const second = await f.editor.mutation(api.posts.mutations.duplicate, {
    postId: first,
  });
  const copy = await f.t.run(async (ctx) => {
    await ctx.db.patch(second, { status: "publish" });
    return (await ctx.db.get(second))!;
  });
  await f.grant(0);
  await f.grant(1);
  expect(
    (await f.reader.query(api.pages.queries.getByPath, { path: copy.path! }))
      ?.content,
  ).toBeUndefined();
  await f.grant(3);
  expect(
    (await f.reader.query(api.pages.queries.getByPath, { path: copy.path! }))
      ?.content,
  ).toBe("Protected authored body");
  const rows = await f.t.run((ctx) =>
    ctx.db
      .query("membership_restriction_rules")
      .withIndex("by_resource", (q) =>
        q.eq("resourceType", "page").eq("resourceIdOrKey", second),
      )
      .collect(),
  );
  expect(new Set(rows.map((row) => row.policyGroup)).size).toBe(3);
});

test("policy snapshot respects the caller's remaining row and byte budget before writes", async () => {
  const f = await fixture();
  for (const budget of [
    { maxRows: 2, maxBytes: 100000 },
    { maxRows: 256, maxBytes: 1 },
  ]) {
    await expect(
      f.t.run(async (ctx) =>
        prepareContentRestrictionCopy(
          ctx,
          (await ctx.db.get(f.postId))!,
          budget,
        ),
      ),
    ).rejects.toMatchObject({ data: { code: "LIMIT_EXCEEDED" } });
  }
  expect(await f.t.run((ctx) => ctx.db.query("posts").collect())).toHaveLength(
    1,
  );
});

test("incomplete source route policy pages refuse duplication without a partial draft", async () => {
  const f = await fixture();
  await f.t.run(async (ctx) => {
    for (let i = 0; i < 255; i++)
      await ctx.db.insert("membership_restriction_rules", {
        resourceType: "route",
        resourceIdOrKey: `/unrelated-${i}`,
        ruleMode: "allow_only",
        planIds: [],
        teaserMode: "hide",
        loginRequired: true,
        createdAt: 1,
        updatedAt: 1,
      });
  });
  await expect(
    f.editor.mutation(api.posts.mutations.duplicate, { postId: f.postId }),
  ).rejects.toMatchObject({ data: { code: "MEMBERSHIP_POLICY_BUDGET" } });
  expect(await f.t.run((ctx) => ctx.db.query("posts").collect())).toHaveLength(
    1,
  );
  expect(await f.t.run((ctx) => ctx.db.query("events").collect())).toHaveLength(
    0,
  );
});
