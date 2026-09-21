import { expect, test } from "bun:test";
import { fixture, create, save, get, withdraw, reference, review } from "./fixture.test-support";
import { syncDocumentContactForms } from "../../canonicalDocuments/contactDocuments";
import { contactSourceAllowed } from "../../canonicalDocuments/contactSource";
import { resolvePublishedOccurrences } from "../occurrences";
import { validateCanonicalTree } from "../../canonicalDocuments/foundation/generated/instances";
import { RequestReadLedger } from "../../helpers/requestReadLedger";
import { publishedFixture } from "./publishedFixture.test-support";
const email = { name: "email", label: "Email", type: "email", required: true };
const message = { name: "message", label: "Message", type: "textarea", required: false };
const contact = (fields: unknown[] = [email, message]) => [{ id: "contact", name: "core/contact-form", version: 2, attrs: { heading: "Write to the studio", fields } }];
async function setup() {
  const f = await fixture();
  await f.t.run(async ctx => {
    const role = (await ctx.db.get("roles", f.ids.role))!;
    await ctx.db.patch("roles", role._id, { level: 80, capabilities: [...role.capabilities, "form.create", "form.update"] });
    await ctx.db.insert("settings", { section: "plugins", values: { formsEnabled: true, membershipEnabled: false }, updatedAt: 1, updatedBy: f.ids.user });
  });
  const source = await f.operator.mutation(create, { title: "Contact source", blocks: contact() });
  await f.release(source.id, 1, 1);
  const blocks = validateCanonicalTree([{ ...reference(source.id)[0], id: "latest" }, { ...reference(source.id, 1)[0], id: "pinned" }]);
  const postId = await f.t.run(ctx => ctx.db.insert("posts", { type: "page", title: "Studio", slug: "studio", status: "publish", visibility: "public", authorId: f.ids.user, commentStatus: "closed", blocksVersion: 2, blocks, createdAt: 1, updatedAt: 1 }));
  const args = { postId, title: "Studio", blocks };
  const synchronize = () => f.operator.run(ctx => syncDocumentContactForms(ctx, args));
  const forms = () => f.t.run(ctx => ctx.db.query("forms").take(20));
  const plan = () => f.t.run(async ctx => ({ resolverTree: (await resolvePublishedOccurrences(ctx, blocks, new RequestReadLedger())).resolverTree }));
  return { ...f, source, postId, blocks, args, synchronize, forms, plan };
}

test("reused contact projections use the same stable occurrence IDs as rendering and public authority", async () => {
  const f = await setup();await f.synchronize();
  const plan = await f.plan(), forms = await f.forms();
  const ids = plan.resolverTree.map(node => node.id);
  expect(forms).toHaveLength(2);
  expect(forms.map(form => form.contactBlockId).sort()).toEqual([...ids].sort());
  expect(forms[0]._id).not.toBe(forms[1]._id);
  expect(forms[0].fieldGroupId).not.toBe(forms[1].fieldGroupId);
  for (const form of forms) expect(await f.t.run(ctx => contactSourceAllowed(ctx, form))).toBe(true);
  await f.t.run(ctx => syncDocumentContactForms(ctx, { ...f.args, scheduled: true }));
  expect(await f.forms()).toEqual(forms);
  expect((await f.operator.query(get, { id: f.source.id })).blocks[0].id).toBe("contact");
  expect((await f.t.run(ctx => ctx.db.get("posts", f.postId)))!.blocks).toEqual(f.blocks);
});

test("latest source revisions reconcile existing fields and retain answers while pinned forms keep revision one", async () => {
  const f = await setup();await f.synchronize();
  const ids = (await f.plan()).resolverTree.map(node => node.id), forms = await f.forms();
  const latest = forms.find(form => form.contactBlockId === ids[0])!, pinned = forms.find(form => form.contactBlockId === ids[1])!;
  expect(latest).toBeDefined();expect(pinned).toBeDefined();
  const previous = await f.t.run(ctx => ctx.db.query("fieldDefinitions").withIndex("by_group", q => q.eq("groupId", latest.fieldGroupId!)).take(12));
  const removed = previous.find(field => field.name === "message")!;
  const answer = await f.t.run(async ctx => {
    const entry = await ctx.db.insert("form_submissions", { formId: latest._id, status: "complete", createdAt: 1, updatedAt: 1 });
    return ctx.db.insert("fieldValues", { entityType: "form_submission", entityId: entry, fieldKey: removed.key, fieldName: removed.name, value: "Keep this message", updatedBy: "fixture", updatedAt: 1 });
  });
  const savedAnswer = await f.t.run(ctx => ctx.db.get("fieldValues", answer));
  await f.operator.mutation(save, { id: f.source.id, expectedGeneration: 2, title: "Contact source", blocks: contact([{ ...email, label: "Your email" }]) });
  await f.release(f.source.id, 3, 2);
  expect(await f.t.run(ctx => contactSourceAllowed(ctx, latest))).toBe(false);
  expect(await f.t.run(ctx => contactSourceAllowed(ctx, pinned))).toBe(true);
  // A scheduled publish may verify existing projections, never impersonate an
  // editor or rewrite a stale one. Authenticated reconciliation repairs it.
  await expect(f.t.run(ctx => syncDocumentContactForms(ctx, { ...f.args, scheduled: true }))).rejects.toThrow("Save the contact form again");
  await f.synchronize();
  const current = await f.forms();expect(current.map(form => form._id)).toEqual(forms.map(form => form._id));
  expect((await f.t.run(ctx => ctx.db.get("fieldDefinitions", removed._id)))!.groupId).not.toBe(latest.fieldGroupId);
  expect(await f.t.run(ctx => ctx.db.get("fieldValues", answer))).toEqual(savedAnswer);
  expect((await f.plan()).resolverTree.map(node => node.id)).toEqual(ids);
  for (const form of current) expect(await f.t.run(ctx => contactSourceAllowed(ctx, form))).toBe(true);
  await f.release(f.source.id, 4, 1);await f.synchronize();
  expect((await f.t.run(ctx => ctx.db.get("fieldDefinitions", removed._id)))!.groupId).toBe(latest.fieldGroupId);
  expect(await f.t.run(ctx => ctx.db.get("fieldValues", answer))).toEqual(savedAnswer);
});

test("reused contact creation and repair require the current actor's Forms permissions and transaction budget", async () => {
  const f = await setup();
  await expect(f.t.run(ctx => syncDocumentContactForms(ctx, f.args))).rejects.toThrow();
  await expect(f.operator.run(ctx => syncDocumentContactForms(ctx, f.args, new RequestReadLedger({ queries: 8, documents: 2048, bytes: 8388608, documentBytes: 524288 })))).rejects.toThrow();
  expect(await f.forms()).toEqual([]);
  await f.synchronize();const before = await f.forms();
  await f.t.run(ctx => ctx.db.patch("roles", f.ids.role, { capabilities: ["form.create"] }));
  await expect(f.operator.run(async ctx => {
    await ctx.db.patch("posts", f.postId, { title: "Must roll back" });
    await syncDocumentContactForms(ctx, f.args);
  })).rejects.toThrow("Insufficient permissions");
  expect(await f.forms()).toEqual(before);
  expect((await f.t.run(ctx => ctx.db.get("posts", f.postId)))!.title).toBe("Studio");
});

test("withdrawn sources retain form history and deny use; scheduled publication requires an available graph", async () => {
  const f = await setup();await f.synchronize();const forms = await f.forms();expect(forms).toHaveLength(2);
  await f.operator.mutation(withdraw, { id: f.source.id, expectedGeneration: 2 });
  await f.synchronize();expect(await f.forms()).toEqual(forms);
  for (const form of forms) expect(await f.t.run(ctx => contactSourceAllowed(ctx, form))).toBe(false);
  await expect(f.t.run(ctx => syncDocumentContactForms(ctx, { ...f.args, scheduled: true }))).rejects.toThrow("unavailable");
  await f.release(f.source.id, 3, 1);await f.synchronize();
  expect((await f.forms()).map(form => form._id)).toEqual(forms.map(form => form._id));
  await f.t.run(ctx => ctx.db.patch("convexpress_siteIdentity", f.ids.site, { instanceKey: "other-environment" }));
  await f.synchronize();
  for (const form of await f.forms()) expect(await f.t.run(ctx => contactSourceAllowed(ctx, form))).toBe(false);
});

test("source publication rejects invalid contact definitions before exposing them to dependent pages", async () => {
  const f = await setup();
  await f.operator.mutation(save, { id: f.source.id, expectedGeneration: 2, title: "Broken contact", blocks: contact([email, email]) });
  await expect(f.operator.query(review, { id: f.source.id, expectedGeneration: 3, revision: 2 })).rejects.toMatchObject({ data: { code: "CONTACT_FORM_CONFIGURATION", blockId: "contact", field: "fields.1.name" } });
  expect((await f.operator.query(get, { id: f.source.id })).publishedRevision).toBe(1);
});

test("nested reusable groups reconcile contacts without changing their authored source identity", async () => {
  const f = await setup();
  const outer = await f.operator.mutation(create, { title: "Studio footer", blocks: [{ id: "footer-group", name: "core/group", version: 1, attrs: {}, children: reference(f.source.id) }] });
  await f.release(outer.id, 1, 1);
  const blocks = validateCanonicalTree(reference(outer.id));
  await f.operator.run(async ctx => {
    await ctx.db.patch("posts", f.postId, { blocks });
    await syncDocumentContactForms(ctx, { ...f.args, blocks });
  });
  const forms = await f.forms();expect(forms).toHaveLength(1);
  const identity = await f.t.run(async ctx => {
    const plan = await resolvePublishedOccurrences(ctx, blocks, new RequestReadLedger());
    const placement = [...plan.byId.values()].find(value => value.node.name === "core/contact-form")!;
    return { id: placement.id, authored: placement.node.id, sources: placement.sourceChain.map(value => value.id) };
  });
  expect(forms[0].contactBlockId).toBe(identity.id);expect(identity.authored).toBe("contact");
  expect(identity.sources).toEqual([outer.id, f.source.id]);
  expect(await f.t.run(ctx => contactSourceAllowed(ctx, forms[0]))).toBe(true);
});

test("publication reviews validate contact definitions in older nested sources too", async () => {
  const f = await setup();
  const old = await f.t.run(ctx => publishedFixture(ctx, f.ids.user, contact([email, email])));
  const outer = await f.operator.mutation(create, { title: "Older nested contact", blocks: reference(old) });
  await expect(f.operator.query(review, { id: outer.id, expectedGeneration: 1, revision: 1 })).rejects.toThrow("unique name");
  expect((await f.operator.query(get, { id: outer.id })).publishedRevision).toBeNull();
});
