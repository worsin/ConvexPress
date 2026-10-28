import { expect, test } from "bun:test";
import { convexTest } from "convex-test";

import { internal } from "../../_generated/api";
import schema from "../../schema";
import { BUILT_IN_ROLES } from "../../seed/roles";

const modules = {
  "./convex/_generated/api.js": () => import("../../_generated/api.js"),
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/roles/internals.ts": () => import("../internals"),
};

const definition = (slug: string) => BUILT_IN_ROLES.find((role) => role.slug === slug)!;

async function insertRole(t: ReturnType<typeof convexTest>, slug: string, capabilities: string[], builtInCapabilities?: string[]) {
  const role = definition(slug);
  return await t.run((ctx) =>
    ctx.db.insert("roles", {
      name: role.name,
      slug,
      description: role.description,
      level: role.level,
      type: role.type,
      isDefault: role.isDefault,
      isProtected: role.isProtected,
      capabilities,
      ...(builtInCapabilities ? { builtInCapabilities } : {}),
      pageAccess: role.pageAccess,
      status: "active",
      createdAt: 1,
      updatedAt: 1,
    }),
  );
}

test("built-in roles receive capabilities their definition gained, once, and keep an administrator's removals", async () => {
  const t = convexTest({ schema, modules });
  const editor = definition("editor");
  const [newest, removed, ...rest] = [...editor.capabilities].reverse();
  // An editor role recorded before `newest` was added to the definition, with `removed` taken away by an administrator.
  const editorId = await insertRole(t, "editor", rest, [removed!, ...rest]);
  // An Administrator from before roles recorded their definition: completed to every capability.
  const adminId = await insertRole(t, "administrator", ["post.read"]);

  const first = await t.mutation(internal.roles.internals.seedRoles, {});
  expect(first.granted).toContainEqual({ slug: "editor", capabilities: [newest!] });
  const editorRole = (await t.run((ctx) => ctx.db.get(editorId)))!;
  expect(editorRole.capabilities).toContain(newest!);
  expect(editorRole.capabilities).not.toContain(removed!);
  expect(editorRole.builtInCapabilities).toEqual([...editor.capabilities]);
  const adminRole = (await t.run((ctx) => ctx.db.get(adminId)))!;
  expect([...adminRole.capabilities].sort()).toEqual([...definition("administrator").capabilities].sort());

  // Running again grants nothing and writes nothing.
  const updatedAt = editorRole.updatedAt;
  const second = await t.mutation(internal.roles.internals.seedRoles, {});
  expect(second.granted).toEqual([]);
  expect((await t.run((ctx) => ctx.db.get(editorId)))!.updatedAt).toBe(updatedAt);
});

test("a non-administrator role from before the record is left as it is and starts recording", async () => {
  const t = convexTest({ schema, modules });
  const author = definition("author");
  const customized = author.capabilities.slice(1);
  const authorId = await insertRole(t, "author", customized);
  const result = await t.mutation(internal.roles.internals.seedRoles, {});
  expect(result.granted.find((entry) => entry.slug === "author")).toBeUndefined();
  const role = (await t.run((ctx) => ctx.db.get(authorId)))!;
  expect(role.capabilities).toEqual(customized);
  expect(role.builtInCapabilities).toEqual([...author.capabilities]);
});
