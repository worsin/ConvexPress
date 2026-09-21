import { expect, test } from "bun:test";
import { contactArgsSchema, contactResultSchema } from "./contactDataContracts";
import { planCanonicalData } from "./planner";
import { resolveCanonicalData, validateCanonicalData } from "./resolve";
const scope = { websiteKey: "site", instanceKey: "staging" };
const policy = { enabledPlugins: ["forms"], capabilities: ["contact.submission"], disabledBlocks: [] };
const tree = [{ id: "first", name: "core/contact-form", version: 2, attrs: {} }, { id: "second", name: "core/contact-form", version: 2, attrs: {} }];
const resolve = (read: (args: { blockId: string }) => Promise<unknown>, input: unknown = tree) => resolveCanonicalData(input, scope, policy, async () => null,
  undefined, undefined, undefined, {}, undefined, undefined, undefined, undefined, undefined, read);
test("compiled Contact bindings isolate otherwise identical blocks without authored post/form IDs", async () => {
  const plan = planCanonicalData(tree, scope, policy);
  expect(plan.jobs.map(job => job.args)).toEqual([{ blockId: "first" }, { blockId: "second" }]);
  expect(plan.jobs).toHaveLength(2);
  const seen: string[] = [];
  const envelope = await resolve(async args => { seen.push(args.blockId); return { ...args, form: null, asOf: 1, nextChangeAt: null }; });
  expect(seen).toEqual(["first", "second"]);
  expect(validateCanonicalData(tree, scope, policy, envelope)).toEqual(envelope);
  expect(contactArgsSchema.safeParse({ blockId: "first", postId: "other" }).success).toBe(false);
  expect(contactArgsSchema.safeParse({ blockId: "first", form: "other" }).success).toBe(false);
  await expect(resolve(async () => null, [{ ...tree[0], attrs: { blockId: "second" } }])).rejects.toThrow();
});
test("wrong source-block results fail both resolver and installed-envelope validation", async () => {
  await expect(resolve(async () => ({ blockId: "other", form: null, asOf: 1, nextChangeAt: null }))).rejects.toThrow("source block");
  const envelope = await resolve(async args => ({ ...args, form: null, asOf: 1, nextChangeAt: null }));
  const tampered = structuredClone(envelope);
  (tampered.dataByBlock.first.data as { blockId: string }).blockId = "second";
  expect(() => validateCanonicalData(tree, scope, policy, tampered)).toThrow();
  expect(contactResultSchema.safeParse({ blockId: "first", form: null, asOf: 1, nextChangeAt: null, recipientEmail: "private@example.invalid" }).success).toBe(false);
});
test("missing Contact reader, disabled plugin or unavailable host refuses before any data read", async () => {
  let reads = 0;
  await expect(resolveCanonicalData(tree, scope, policy, async () => { reads++; return null; })).rejects.toThrow("Trusted contact reader");
  expect(reads).toBe(0);
  for (const changed of [{ ...policy, enabledPlugins: [] }, { ...policy, capabilities: [] }, { ...policy, disabledBlocks: ["core/contact-form"] }])
    expect(() => planCanonicalData(tree, scope, changed)).toThrow();
});
