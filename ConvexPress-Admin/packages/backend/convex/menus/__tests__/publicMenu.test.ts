import { test, expect } from "bun:test";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { makeFunctionReference } from "convex/server";
import type { PublicMenuResult } from "../publicContract";
const getMenuForLocation = makeFunctionReference<
  "query",
  { locationSlug: string },
  PublicMenuResult | null
>("menus/queries:getMenuForLocation");
import type { Doc, Id } from "../../_generated/dataModel";
import type { PublicMenuItem } from "../publicContract";
import { membershipGrantIsCurrent } from "../../helpers/membershipAuthority";
import type { GrantResult } from "../../membership/policyReads";

const modules = {
  "./convex/menus/queries.ts": () => import("../queries"),
  "./convex/_generated/api.js": () => import("../../_generated/api.js"),
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/membership/policyReads.ts": () => import("../../membership/policyReads"),
};
async function fixture() {
  const t = convexTest({ schema, modules });
  const ids = await t.run(async (ctx) => {
    const user = await ctx.db.insert("users", {
      authSource: "local",
      email: "menu@example.invalid",
      emailVerified: true,
      status: "active",
      createdAt: 1,
      updatedAt: 1,
    });
    await ctx.db.insert("settings", {
      section: "plugins",
      values: { membershipEnabled: false },
      updatedAt: 1,
      updatedBy: user,
    });
    const menu = await ctx.db.insert("menus", {
      name: "Main Navigation",
      slug: "main-navigation",
      description: "PRIVATE_MENU_NOTES",
      createdBy: user,
      createdAt: 1,
      updatedAt: 1,
    });
    await ctx.db.insert("menuLocations", {
      slug: "header",
      name: "Header",
      menuId: menu,
      createdAt: 1,
      updatedAt: 1,
    });
    return { user, menu };
  });
  const add = (label: string, fields: Partial<Doc<"menuItems">> = {}) =>
    t.run((ctx) =>
      ctx.db.insert("menuItems", {
        menuId: ids.menu,
        itemType: "custom",
        label,
        url: `/${label}`,
        position: 0,
        createdAt: 1,
        updatedAt: 1,
        ...fields,
      }),
    );
  const read = () => t.query(getMenuForLocation, { locationSlug: "header" });
  return { t, ids, add, read };
}
function flatten(items: PublicMenuItem[]): PublicMenuItem[] {
  return items.flatMap((item) => [item, ...flatten(item.children)]);
}

test('membership menu visibility includes valid grants beyond the old twenty-row cutoff', async () => {
  const { t, ids, add } = await fixture();
  await t.run(async ctx => {
    await ctx.db.patch('users', ids.user, {authSource:'clerk',clerkUserId:'many-grants'});
    const starter=await ctx.db.insert('membership_plans',{title:'Starter',slug:'starter',status:'active',grantMode:'manual',priority:1,createdAt:1,updatedAt:1});
    const final=await ctx.db.insert('membership_plans',{title:'Final',slug:'final',status:'active',grantMode:'manual',priority:1,createdAt:1,updatedAt:1});
    for(let i=0;i<21;i++)await ctx.db.insert('membership_grants',{userId:ids.user,planId:i===20?final:starter,status:'active',sourceType:'manual',startsAt:1,createdAt:1,updatedAt:1});
  });
  await add('last-plan', {membershipPlans:['final']});
  const result=await t.withIdentity({subject:'many-grants',issuer:'https://clerk.example.invalid'}).query(getMenuForLocation,{locationSlug:'header'});
  expect(result!.items.map(item=>item.label)).toEqual(['last-plan']);
});

test('taxonomy destinations follow current type and slug; dashboard links obey registry gates', async () => {
  const { t, add, read } = await fixture();
  const term=await t.run(ctx=>ctx.db.insert('terms',{name:'Current',slug:'current',taxonomy:'category',count:0,isDefault:false,createdAt:1,updatedAt:1}));
  await add('category',{itemType:'category',objectId:term,url:'/old'});
  await add('wrong-taxonomy',{itemType:'tag',objectId:term,url:'/old'});
  await add('orders',{itemType:'dashboard',objectId:'orders'});
  await add('posts',{itemType:'dashboard',objectId:'posts'});
  await add('unknown',{itemType:'dashboard',objectId:'unknown'});
  await t.run(async ctx=>{
    const settings=await ctx.db.query('settings').withIndex('by_section',q=>q.eq('section','plugins')).unique();
    await ctx.db.patch('settings',settings!._id,{values:{commerceEnabled:false}});
  });
  expect((await read())!.items.map(item=>[item.label,item.url])).toEqual([['category','/category/current']]);
  await t.run(async ctx=>{
    await ctx.db.patch('terms',term,{slug:'renamed'});
    const settings=await ctx.db.query('settings').withIndex('by_section',q=>q.eq('section','plugins')).unique();
    await ctx.db.patch('settings',settings!._id,{values:{commerceEnabled:true}});
  });
  expect((await read())!.items.map(item=>[item.label,item.url])).toEqual([['category','/category/renamed'],['orders','/dashboard/orders']]);
});

test("depth is intrinsic to the tree even when deepest descendants sort first", async () => {
  const { add, read } = await fixture();
  let parent: Id<"menuItems"> | undefined;
  for (let depth = 0; depth < 9; depth++)
    parent = await add(`level-${depth}`, { parentItemId: parent, position: 9 - depth, depth: 99 });
  const result = await read();
  expect(flatten(result!.items).map((item) => [item.label, item.depth])).toEqual(
    Array.from({ length: 6 }, (_, depth) => [`level-${depth}`, depth]),
  );
});

test("hidden, missing, cross-menu, orphaned and cyclic parents never promote descendants", async () => {
  const { t, ids, add, read } = await fixture();
  await add("visible");
  const hidden = await add("hidden", { visibility: "signedIn" });
  await add("hidden-child", { parentItemId: hidden });
  const orphan = await add("orphan", { isOrphaned: true });
  await add("orphan-child", { parentItemId: orphan });
  const removed = await add("removed");
  await add("removed-child", { parentItemId: removed });
  await t.run((ctx) => ctx.db.delete("menuItems", removed));
  const other = await t.run((ctx) =>
    ctx.db.insert("menus", {
      name: "Other",
      slug: "other",
      createdBy: ids.user,
      createdAt: 1,
      updatedAt: 1,
    }),
  );
  const foreign = await add("foreign", { menuId: other });
  await add("foreign-child", { parentItemId: foreign });
  const a = await add("cycle-a"),
    b = await add("cycle-b", { parentItemId: a });
  await t.run((ctx) => ctx.db.patch("menuItems", a, { parentItemId: b }));
  await add("cycle-child", { parentItemId: b });
  expect(flatten((await read())!.items).map((item) => item.label)).toEqual(["visible"]);
});

test("content links require current discoverability and never use a stale saved URL", async () => {
  const { t, ids, add, read } = await fixture();
  const post = await t.run((ctx) =>
    ctx.db.insert("posts", {
      type: "page",
      title: "Page",
      slug: "current",
      path: "/current",
      content: "PRIVATE_BODY",
      status: "publish",
      visibility: "public",
      authorId: ids.user,
      commentStatus: "closed",
      createdAt: 1,
      updatedAt: 1,
    }),
  );
  await add("page", {
    itemType: "page",
    objectId: post,
    url: "/stale",
    roles: [],
    capability: undefined,
  });
  await add("wrong-type", { itemType: "post", objectId: post, url: "/stale" });
  await add("bad-id", { itemType: "page", objectId: "invalid", url: "/stale" });
  expect(flatten((await read())!.items).map((item) => [item.label, item.url])).toEqual([
    ["page", "/page/current"],
  ]);
  for (const changes of [
    { status: "draft" as const },
    { status: "publish" as const, visibility: "private" as const },
    { visibility: "password" as const },
  ]) {
    await t.run((ctx) => ctx.db.patch("posts", post, changes));
    expect((await read())!.items).toEqual([]);
  }
  await t.run(async (ctx) => {
    await ctx.db.patch("posts", post, { visibility: "public" });
    const plugins = await ctx.db
      .query("settings")
      .withIndex("by_section", (q) => q.eq("section", "plugins"))
      .unique();
    await ctx.db.patch("settings", plugins!._id, { values: { membershipEnabled: true } });
    await ctx.db.insert("membership_restriction_rules", {
      resourceType: "page",
      resourceIdOrKey: post,
      ruleMode: "allow_only",
      planIds: [],
      requiredCapabilities: ["private.reader"],
      teaserMode: "hide",
      loginRequired: true,
      createdAt: 1,
      updatedAt: 1,
    });
  });
  expect((await read())!.items).toEqual([]);
  await t.run((ctx) => ctx.db.delete("posts", post));
  expect((await read())!.items).toEqual([]);
});

test("public projection excludes editor policy and metadata and rejects unsafe destinations", async () => {
  const { add, read } = await fixture();
  await add("safe", {
    url: "https://example.invalid",
    target: "_blank",
    linkRel: "nofollow",
    roles: [],
    membershipPlans: [],
    pathOverride: "/private-override",
    wpPostId: 123,
  });
  for (const [i, url] of [
    "javascript:alert(1)",
    "//example.invalid",
    "/\\evil",
    "java\nscript:alert(1)",
  ].entries())
    await add(`bad${i}`, { url });
  await add("heading", { itemType: "heading", url: "javascript:alert(1)" });
  const result = (await read())!;
  expect(result.items.map((item) => item.label)).toEqual(["safe", "heading"]);
  expect(result.items[0].linkRel).toBe("nofollow noopener noreferrer");
  expect(result.items[1].url).toBeUndefined();
  const serialized = JSON.stringify(result);
  for (const key of [
    "roles",
    "membershipPlans",
    "pathOverride",
    "wpPostId",
    "createdBy",
    "PRIVATE_MENU_NOTES",
    "javascript",
  ])
    expect(serialized).not.toContain(key);
});

test("oversized source menus refuse explicitly including hidden rows", async () => {
  const { t, ids, read } = await fixture();
  await t.run(async (ctx) => {
    for (let i = 0; i < 501; i++)
      await ctx.db.insert("menuItems", {
        menuId: ids.menu,
        itemType: "heading",
        label: "Hidden",
        visibility: "signedIn",
        position: i,
        createdAt: 1,
        updatedAt: 1,
      });
  });
  await expect(read()).rejects.toThrow("supported item limit");
});

test("plan and role menu rules use current grants, including future starts and overdue expiry jobs", async () => {
  const { t, ids, add } = await fixture();
  const grant = await t.run(async (ctx) => {
    await ctx.db.patch("users", ids.user, { authSource: "clerk", clerkUserId: "menu-customer" });
    const role = await ctx.db.insert("roles", {
      name: "Member",
      slug: "member",
      description: "Customer only",
      level: 20,
      type: "customer",
      isDefault: false,
      isProtected: false,
      capabilities: ["post.read"],
      pageAccess: [],
      status: "active",
      createdAt: 1,
      updatedAt: 1,
    });
    const plan = await ctx.db.insert("membership_plans", {
      title: "Member",
      slug: "member",
      status: "active",
      grantMode: "manual",
      linkedRoleId: role,
      priority: 1,
      createdAt: 1,
      updatedAt: 1,
    });
    return await ctx.db.insert("membership_grants", {
      userId: ids.user,
      planId: plan,
      status: "active",
      sourceType: "manual",
      startsAt: 1,
      createdAt: 1,
      updatedAt: 1,
    });
  });
  await add("plan", { membershipPlans: ["member"] });
  await add("role", { roles: ["member"] });
  await add("capability", { capability: "post.read" });
  const read = () =>
    t
      .withIdentity({ subject: "menu-customer", issuer: "https://clerk.example.invalid" })
      .query(getMenuForLocation, { locationSlug: "header" });
  expect((await read())!.items.map((item) => item.label)).toEqual(["plan", "role", "capability"]);
  for (const patch of [
    { startsAt: Date.now() + 60_000 },
    { startsAt: 1, endsAt: Date.now() - 1 },
    { endsAt: undefined, revokedAt: 0 },
    { revokedAt: undefined, status: "grace" as const, graceEndsAt: Date.now() - 1 },
  ]) {
    await t.run((ctx) => ctx.db.patch("membership_grants", grant, patch));
    expect((await read())!.items).toEqual([]);
  }
  await t.run((ctx) =>
    ctx.db.patch("membership_grants", grant, {
      status: "grace",
      endsAt: 1,
      graceEndsAt: Date.now() + 60_000,
    }),
  );
  expect((await read())!.items).toHaveLength(3);
  await t.run((ctx) => ctx.db.patch("users", ids.user, { status: "inactive" }));
  expect((await read())!.items).toEqual([]);
});

test("grant intervals are inclusive at the start and exclusive at expiry, with explicit bounded grace", () => {
  const grant: GrantResult = {
    planId: "synthetic" as Id<"membership_plans">,
    status: "active",
    startsAt: 100,
    endsAt: 200,
  };
  expect(membershipGrantIsCurrent(grant, 99)).toBe(false);
  expect(membershipGrantIsCurrent(grant, 100)).toBe(true);
  expect(membershipGrantIsCurrent(grant, 199)).toBe(true);
  expect(membershipGrantIsCurrent(grant, 200)).toBe(false);
  expect(membershipGrantIsCurrent({ ...grant, endsAt: 0 }, 100)).toBe(false);
  expect(membershipGrantIsCurrent({ ...grant, revokedAt: 0 }, 100)).toBe(false);
  expect(membershipGrantIsCurrent({ ...grant, status: "grace" }, 200)).toBe(false);
  expect(membershipGrantIsCurrent({ ...grant, status: "grace", graceEndsAt: 300 }, 299)).toBe(true);
  expect(membershipGrantIsCurrent({ ...grant, status: "grace", graceEndsAt: 300 }, 300)).toBe(
    false,
  );
});

test("membership-protected page links disappear when the plan is archived or the customer is disabled", async () => {
  const { t, ids, add } = await fixture();
  const plan = await t.run(async (ctx) => {
    await ctx.db.patch("users", ids.user, { authSource: "clerk", clerkUserId: "menu-customer" });
    const plugins = await ctx.db
      .query("settings")
      .withIndex("by_section", (q) => q.eq("section", "plugins"))
      .unique();
    await ctx.db.patch("settings", plugins!._id, { values: { membershipEnabled: true } });
    const plan = await ctx.db.insert("membership_plans", {
      title: "Member",
      slug: "member",
      status: "active",
      grantMode: "manual",
      priority: 1,
      createdAt: 1,
      updatedAt: 1,
    });
    await ctx.db.insert("membership_grants", {
      userId: ids.user,
      planId: plan,
      status: "active",
      sourceType: "manual",
      startsAt: 1,
      createdAt: 1,
      updatedAt: 1,
    });
    const page = await ctx.db.insert("posts", {
      type: "page",
      title: "Members",
      slug: "members",
      status: "publish",
      visibility: "public",
      authorId: ids.user,
      commentStatus: "closed",
      createdAt: 1,
      updatedAt: 1,
    });
    await ctx.db.insert("membership_restriction_rules", {
      resourceType: "page",
      resourceIdOrKey: page,
      ruleMode: "allow_only",
      planIds: [plan],
      teaserMode: "hide",
      loginRequired: true,
      createdAt: 1,
      updatedAt: 1,
    });
    return { plan, page };
  });
  await add("members", { itemType: "page", objectId: plan.page });
  const read = () =>
    t
      .withIdentity({ subject: "menu-customer", issuer: "https://clerk.example.invalid" })
      .query(getMenuForLocation, { locationSlug: "header" });
  expect((await read())!.items).toHaveLength(1);
  await t.run((ctx) => ctx.db.patch("membership_plans", plan.plan, { status: "archived" }));
  expect((await read())!.items).toEqual([]);
  await t.run(async (ctx) => {
    await ctx.db.patch("membership_plans", plan.plan, { status: "active" });
    await ctx.db.patch("users", ids.user, { status: "inactive" });
  });
  expect((await read())!.items).toEqual([]);
});
