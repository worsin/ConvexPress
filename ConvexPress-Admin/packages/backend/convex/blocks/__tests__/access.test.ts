import { expect, test } from "bun:test";
import { commerceHarness } from "../../commerce/__tests__/handlerHarness.test-support";
import * as mutations from "../mutations";
import { getForDocument, getEditableDocumentForAi } from "../queries";

const block = { id: "one", name: "core/paragraph", version: 1, attrs: { body: "Protected body" } };
const run = (fn: any, ctx: any, args: any = { postId: "post" }) => fn._handler(ctx, args);
function fixture(type = "post", userId: string | null = "author", owner = "other") {
  return commerceHarness({
    posts: [{ _id: "post", type, authorId: owner, status: "auto-draft", visibility: "public", slug: "example", blocks: [block], blocksRevision: 0 }],
    users: [{ _id: "author", authSource: "local", status: "active", roleId: "role" }],
    roles: [{ _id: "role", slug: "author", type: "internal", status: "active", level: 50, capabilities: ["blocks.ai", "post.update", "page.update"] }],
  }, userId);
}
const writes = [
  [mutations.updateBlockAttrs, { blockId: "one", attrs: { body: "Changed" } }],
  [mutations.insertBlock, { block: { ...block, id: "two" } }],
  [mutations.moveBlock, { blockId: "one", toIndex: 0 }],
  [mutations.duplicateBlock, { blockId: "one" }],
  [mutations.removeBlock, { blockId: "one" }],
  [mutations.replaceBlocks, { blocks: [] }],
] as const;

for (const type of ["post", "page"]) {
  test(`${type}: another author's blocks cannot be read for editing or changed through any mutation`, async () => {
    for (const [fn, args] of writes) {
      const ctx = fixture(type);
      await expect(run(fn, ctx, { postId: "post", ...args })).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
      expect(ctx.tables.posts[0].blocks).toEqual([block]);
      expect(ctx.tables.posts[0].blocksRevision).toBe(0);
      expect(ctx.calls).toHaveLength(0);
    }
    expect(await run(getForDocument, fixture(type))).toBeNull();
    await expect(run(getEditableDocumentForAi, fixture(type))).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
  });
  test(`${type}: owner and editor retain read/write access; inactive or incapable owners do not`, async () => {
    for (const editor of [false, true]) {
      const ctx = fixture(type, "author", editor ? "other" : "author");
      if (editor) ctx.tables.roles[0].level = 80;
      expect((await run(getEditableDocumentForAi, ctx)).blocks).toEqual([block]);
      expect((await run(getForDocument, ctx)).blocks).toEqual([block]);
      await run(mutations.replaceBlocks, ctx, { postId: "post", blocks: [] });
      expect(ctx.tables.posts[0].blocks).toEqual([]);
    }
    for (const invalid of ["inactive", "capability"]) {
      const ctx = fixture(type, "author", "author");
      if (invalid === "inactive") ctx.tables.users[0].status = "suspended";
      else ctx.tables.roles[0].capabilities = [];
      expect(await run(getForDocument, ctx)).toBeNull();
      await expect(run(mutations.replaceBlocks, ctx, { postId: "post", blocks: [] })).rejects.toBeDefined();
    }
  });
  test(`${type}: public block API enforces password, private, resource and route membership gates`, async () => {
    for (const gate of ["public", "password", "private", "private-status", "resource", "route"]) {
      const ctx = fixture(type, null);
      ctx.tables.posts[0].status = gate === "private-status" ? "private" : "publish";
      if (["password", "private"].includes(gate)) ctx.tables.posts[0].visibility = gate;
      if (["resource", "route"].includes(gate)) {
        ctx.tables.settings[0].values.membershipEnabled = true;
        ctx.tables.membership_restriction_rules = [{ _id: "rule", resourceType: gate === "route" ? "route" : type, resourceIdOrKey: gate === "route" ? (type === "page" ? "/example" : "/blog/example") : "post", ruleMode: "allow_only", planIds: ["plan"], teaserMode: "excerpt" }];
      }
      const result = await run(getForDocument, ctx);
      if (gate === "public") expect(result.blocks).toEqual([block]);
      else expect(result).toBeNull();
    }
  });
}
