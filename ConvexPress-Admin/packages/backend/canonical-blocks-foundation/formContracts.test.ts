import { expect, test } from "bun:test";
import { formResultSchema, publicFormSettings } from "./formContracts";
import { resolveCanonicalData, validateCanonicalData } from "./resolve";

const form = {
  _id: "selected-form", title: "A studio visit", slug: "studio-visit", description: null, settings: "{}",
  availability: { open: true, loginRequired: false, entryLimitReached: false },
  security: { honeypotEnabled: true, honeypotFieldName: "website_url", captchaEnabled: false, captchaProvider: "none", captchaSiteKey: null, recaptchaMinScore: 0.5 },
  fields: [{ _id: "field-one", key: "email", name: "email", label: "Email", type: "email", required: true, defaultValue: null, instructions: null, settings: "{}", conditionalLogic: null, parentFieldId: null, menuOrder: 0 }],
};
const result = { form, asOf: 1, nextChangeAt: null };
const scope = { websiteKey: "site", instanceKey: "staging" };
const policy = { enabledPlugins: ["forms"], capabilities: ["form.submission", "reference.targetResolution"], disabledBlocks: [] };
const tree = [{ id: "embed", name: "core/form", version: 1, attrs: { form: "selected-form" } }];
const resolve = (value: unknown, selectedPolicy = policy) => resolveCanonicalData(tree, scope, selectedPolicy, async () => null,
  undefined, undefined, undefined, {}, undefined, undefined, undefined, undefined, async () => value);
test("form data binds the selected target and is revalidated by its consumer", async () => {
  const envelope = await resolve(result);
  expect(validateCanonicalData(tree, scope, policy, envelope)).toEqual(envelope);
  await expect(resolve({ ...result, form: { ...form, _id: "different" } })).rejects.toThrow("selected resource");
  const tampered = structuredClone(envelope);
  (tampered.dataByBlock.embed.data as any).form._id = "different";
  expect(() => validateCanonicalData(tree, scope, policy, tampered)).toThrow();
  await expect(resolve(result, { ...policy, enabledPlugins: [] })).rejects.toThrow();
  await expect(resolve(result, { ...policy, disabledBlocks: ["core/form"] })).rejects.toThrow();
  expect((await resolve({ form: null, asOf: 1, nextChangeAt: null })).dataByBlock.embed.data).toEqual({ form: null, asOf: 1, nextChangeAt: null });
});
test("public form options exclude administrative references; closed fields reject metadata and duplicate identities", () => {
  const settings = publicFormSettings({ notificationRefs: ["private-notification"], recipient: "private@example.invalid", requireLogin: true,
    orderForm: { enabled: true, paymentTitle: "Complete your booking", processorSecret: "private" } });
  expect(JSON.parse(settings)).toEqual({ requireLogin: true, orderForm: { enabled: true, paymentTitle: "Complete your booking" } });
  expect(formResultSchema.safeParse({ ...result, form: { ...form, settings } }).success).toBe(true);
  expect(formResultSchema.safeParse({ ...result, form: { ...form, settings: '{"orderForm":{"paymentTitle":"Complete your booking","enabled":true},"requireLogin":true}' } }).success).toBe(true);
  for (const changed of [
    { ...form, createdBy: "private" },
    { ...form, settings: '{"notificationRefs":["private"]}' },
    { ...form, fields: [...form.fields, form.fields[0]] },
    { ...form, fields: [{ ...form.fields[0], updatedBy: "private" }] },
  ]) expect(formResultSchema.safeParse({ ...result, form: changed }).success).toBe(false);
});
