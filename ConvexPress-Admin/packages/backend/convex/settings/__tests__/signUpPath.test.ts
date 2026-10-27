/**
 * The site's sign-up page (upstream PR 067): where people without an account
 * start. Only a plain path on this site is accepted or published.
 */
import { expect, test } from "bun:test";
import { convexTest } from "convex-test";
import { api } from "../../_generated/api";
import schema from "../../schema";
import { isSitePathOrBlank, validateSectionValues } from "../validation";

const modules = {
  "./convex/_generated/api.js": () => import("../../_generated/api.js"),
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/settings/queries.ts": () => import("../queries"),
};

test("a sign-up page is blank or a plain path on this site", () => {
  for (const ok of ["", "/get-started", "/forms/doctor-signup", "/"]) expect(isSitePathOrBlank(ok)).toBe(true);
  for (const bad of ["get-started", "//evil.example", "/\\evil", "https://evil.example", "/a b", "/signup?plan=pro", "/signup#form", `/${"a".repeat(200)}`]) {
    expect(isSitePathOrBlank(bad)).toBe(false);
  }
  const general = (signUpPath: unknown) => validateSectionValues("general", { siteTitle: "Example", signUpPath });
  expect(general("/get-started")).toEqual([]);
  expect(general("//evil.example")).toEqual([
    { field: "signUpPath", message: "The sign-up page must be blank or a path on this site, such as /get-started." },
  ]);
  expect(general(5)).toHaveLength(1);
});

test("the website reads the sign-up page, and never one that isn't a site path", async () => {
  const t = convexTest({ schema, modules });
  expect((await t.query(api.settings.queries.getPublic, {})).signUpPath).toBe("");
  const admin = await t.run(async (ctx) => {
    const roleId = await ctx.db.insert("roles", {
      name: "Administrator", slug: "administrator", description: "Test", level: 100, type: "internal", isDefault: false,
      isProtected: true, capabilities: [], pageAccess: [], status: "active", createdAt: 1, updatedAt: 1,
    });
    return await ctx.db.insert("users", { authSource: "local", email: "admin@example.invalid", emailVerified: true, status: "active", roleId, createdAt: 1, updatedAt: 1 });
  });
  const general = (signUpPath: string) =>
    t.run(async (ctx) => {
      const row = await ctx.db.query("settings").withIndex("by_section", (q) => q.eq("section", "general")).unique();
      if (row) await ctx.db.patch("settings", row._id, { values: { signUpPath } });
      else await ctx.db.insert("settings", { section: "general", values: { signUpPath }, updatedAt: 1, updatedBy: admin });
    });
  await general("/get-started");
  expect((await t.query(api.settings.queries.getPublic, {})).signUpPath).toBe("/get-started");
  await general("https://evil.example/signup");
  expect((await t.query(api.settings.queries.getPublic, {})).signUpPath).toBe("");
});
