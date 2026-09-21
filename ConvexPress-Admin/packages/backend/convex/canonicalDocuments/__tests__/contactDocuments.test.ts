import { expect, test } from "bun:test";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { RequestReadLedger } from "../../helpers/requestReadLedger";
import { syncDocumentContactForms } from "../contactDocuments";
import { contactSourceAllowed } from "../contactSource";
import { validateCanonicalTree } from "../foundation/generated/instances";
const modules = { "./convex/_generated/api.js": () => import("../../_generated/api.js"), "./convex/_generated/server.js": () => import("../../_generated/server.js") };
const tree = validateCanonicalTree([{ id: "group", name: "core/group", version: 1, attrs: {}, children: [{ id: "contact", name: "core/contact-form", version: 2, attrs: { fields: [{ name: "email", label: "Email", type: "email", required: true }] } }] }]);
async function fixture() {
  const t = convexTest({ schema, modules });
  const ids = await t.run(async ctx => {
    const role = await ctx.db.insert("roles", { name: "Editor", slug: "editor", description: "Fixture", level: 80, type: "internal", isDefault: false, isProtected: false, capabilities: ["form.create", "form.update"], pageAccess: [], status: "active", createdAt: 1, updatedAt: 1 });
    const user = await ctx.db.insert("users", { authSource: "local", email: "editor@example.invalid", roleId: role, emailVerified: true, status: "active", createdAt: 1, updatedAt: 1 });
    await ctx.db.insert("settings", { section: "plugins", values: { formsEnabled: true, membershipEnabled: false }, updatedAt: 1, updatedBy: user });
    const post = await ctx.db.insert("posts", { type: "page", title: "Contact", slug: "contact", status: "draft", visibility: "public", authorId: user, commentStatus: "closed", blocksVersion: 2, blocks: tree, createdAt: 1, updatedAt: 1 });
    return { user, role, post };
  });
  const admin = t.withIdentity({ subject: ids.user, tokenIdentifier: `https://convexpress-admin.local|${ids.user}` });
  const args = { postId: ids.post, title: "Contact", blocks: tree };
  const forms = () => t.run(ctx => ctx.db.query("forms").collect());
  return { t, ids, admin, args, forms };
}

test("document reconciliation finds nested contacts, repairs no-op saves and isolates duplicate documents", async () => {
  const f = await fixture();
  await f.admin.run(ctx => syncDocumentContactForms(ctx, f.args));
  const [form] = await f.forms();
  expect(form.status).toBe("published");
  expect(await f.t.run(ctx => contactSourceAllowed(ctx, form))).toBe(false); // Source is still draft.
  const field = await f.t.run(ctx => ctx.db.query("fieldDefinitions").withIndex("by_group", q => q.eq("groupId", form.fieldGroupId!)).first());
  await f.t.run(ctx => ctx.db.patch("fieldDefinitions", field!._id, { required: false }));
  await f.admin.run(ctx => syncDocumentContactForms(ctx, f.args));
  expect((await f.forms()).map(row => row._id)).toEqual([form._id]);
  expect((await f.t.run(ctx => ctx.db.get("fieldDefinitions", field!._id)))!.required).toBe(true);
  await f.admin.run(ctx => syncDocumentContactForms(ctx, { ...f.args, blocks: [] }));
  await f.admin.run(ctx => syncDocumentContactForms(ctx, f.args));
  expect((await f.forms())[0]._id).toBe(form._id);
  const copy = await f.t.run(async ctx => {
    const source = await ctx.db.get("posts", f.ids.post);
    const { _id, _creationTime, ...value } = source!;
    return ctx.db.insert("posts", { ...value, slug: "copy" });
  });
  await f.admin.run(ctx => syncDocumentContactForms(ctx, { ...f.args, postId: copy, title: "Copy" }));
  const copied = (await f.forms()).find(row => row.contactPostId === copy)!;
  expect(copied._id).not.toBe(form._id);
  expect(copied.fieldGroupId).not.toBe(form.fieldGroupId);
  expect(copied.title).toBe("Copy — Contact");
});

test("scheduled execution verifies saved fields without login or projection writes", async () => {
  const f = await fixture();
  await expect(f.t.run(ctx => syncDocumentContactForms(ctx, { ...f.args, scheduled: true }))).rejects.toThrow("Save the contact form again");
  expect(await f.forms()).toEqual([]);
  await f.admin.run(ctx => syncDocumentContactForms(ctx, f.args));
  const before = await f.forms();
  await f.t.run(ctx => syncDocumentContactForms(ctx, { ...f.args, scheduled: true }));
  expect(await f.forms()).toEqual(before);
  const form = before[0];
  const field = await f.t.run(ctx => ctx.db.query("fieldDefinitions").withIndex("by_group", q => q.eq("groupId", form.fieldGroupId!)).first());
  await f.t.run(ctx => ctx.db.patch("fieldDefinitions", field!._id, { required: false }));
  await expect(f.t.run(ctx => syncDocumentContactForms(ctx, { ...f.args, scheduled: true }))).rejects.toThrow("Save the contact form again");
  expect((await f.t.run(ctx => ctx.db.get("fieldDefinitions", field!._id)))!.required).toBe(false);
  expect(await f.forms()).toEqual(before);
});

test("late permission failure rolls back earlier form creation in the same document save", async () => {
  const f = await fixture();
  await f.admin.run(ctx => syncDocumentContactForms(ctx, f.args));
  const before = await f.forms();
  await f.t.run(ctx => ctx.db.patch("roles", f.ids.role, { capabilities: ["form.create"] }));
  const candidate = validateCanonicalTree([{ ...tree[0].children![0], id: "new-first" }, tree[0]]);
  await expect(f.admin.run(async ctx => {
    await ctx.db.patch("posts", f.ids.post, { title: "Must roll back" });
    await syncDocumentContactForms(ctx, { ...f.args, blocks: candidate });
  })).rejects.toThrow();
  expect(await f.forms()).toEqual(before);
  expect((await f.t.run(ctx => ctx.db.get("posts", f.ids.post)))!.title).toBe("Contact");
  expect(await f.t.run(ctx => ctx.db.query("fieldGroups").collect())).toHaveLength(1);
});

test("invalid definitions and exhausted budgets leave no partial projection", async () => {
  const f = await fixture();
  const contact = tree[0].children![0];
  const invalid = validateCanonicalTree([contact, { ...contact, id: "invalid", attrs: { fields: [{ name: "constructor", label: "Invalid", type: "text" }] } }]);
  await expect(f.admin.run(ctx => syncDocumentContactForms(ctx, { ...f.args, blocks: invalid }))).rejects.toThrow();
  await expect(f.admin.run(ctx => syncDocumentContactForms(ctx, f.args, new RequestReadLedger({ queries: 4, documents: 2048, bytes: 8388608, documentBytes: 524288 })))).rejects.toThrow();
  expect(await f.forms()).toEqual([]);
  expect(await f.t.run(ctx => ctx.db.query("fieldGroups").collect())).toEqual([]);
});
