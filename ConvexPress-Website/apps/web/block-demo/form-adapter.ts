import { parseContactDefinition } from "../src/templates/sdk/block-data/portable/contactContracts";
import { validateCanonicalTree } from "../src/templates/sdk/block-data/portable/generated/instances";
import { resolveCanonicalData } from "../src/templates/sdk/block-data/portable/resolve";
import type { DataScope, ResolverPolicy } from "../src/templates/sdk/block-data/portable/contracts";
import { formResultSchema } from "../src/templates/sdk/block-data/portable/formContracts";

const fields = [
  { key: "name", label: "Your name", type: "text", required: true, settings: { placeholder: "How should we address you?" } },
  { key: "email", label: "Email address", type: "email", required: true, settings: { placeholder: "you@example.com" } },
  { key: "visit", label: "What brings you here?", type: "select", required: true, settings: { choices: [{ value: "workshop", label: "A hands-on workshop" }, { value: "visit", label: "A studio visit" }, { value: "project", label: "A project together" }] } },
  { key: "next", label: "A little more about your idea", type: "page_break", required: false, settings: {} },
  { key: "message", label: "Tell us what you have in mind", type: "textarea", required: true, settings: { placeholder: "A question, a project, a place to begin…", rows: 5 } },
];
export const demoFormResult = formResultSchema.parse({
  asOf: 1, nextChangeAt: null,
  form: { _id: "demo-form-studio", title: "Let’s make something worthwhile.", slug: "demo-studio", description: "A good conversation is a good beginning. Share a few details and tell us about your idea.", settings: "{}",
    availability: { open: true, loginRequired: false, entryLimitReached: false },
    security: { honeypotEnabled: true, honeypotFieldName: "website_url", captchaEnabled: false, captchaProvider: "none", captchaSiteKey: null, recaptchaMinScore: .5 },
    fields: fields.map((field, index) => ({ ...field, _id: `demo-field-${field.key}`, name: field.key, settings: JSON.stringify(field.settings), instructions: null, defaultValue: null, conditionalLogic: null, parentFieldId: null, menuOrder: index })),
  },
});
/** Synthetic definition only; no production records, mutations or credentials. */
export function resolveFormDemo(tree: unknown, scope: DataScope, policy: ResolverPolicy) {
  return resolveCanonicalData(tree, scope, policy, async () => ({ page: null }), undefined, undefined, undefined, {}, undefined, undefined, undefined, undefined,
    async args => args.form === demoFormResult.form?._id ? demoFormResult : { form: null, asOf: 1, nextChangeAt: null },
    async args => {
      const node = validateCanonicalTree(tree).find(node => node.id === args.blockId);
      if (!node || node.name !== "core/contact-form") return { blockId: args.blockId, form: null, asOf: 1, nextChangeAt: null };
      const attrs = parseContactDefinition(node.attrs), id = `demo-contact-${args.blockId}`;
      return { blockId: args.blockId, asOf: 1, nextChangeAt: null, form: {
        ...demoFormResult.form!, _id: id, title: attrs.heading || "Contact", slug: id, description: null,
        fields: attrs.fields.map((field, menuOrder) => ({ _id: `${id}-${field.name}`, key: field.name, name: field.name, label: field.label,
          type: field.type === "tel" ? "text" : field.type, required: field.required, instructions: null, defaultValue: null, parentFieldId: null, conditionalLogic: null, menuOrder,
          settings: JSON.stringify({ placeholder: field.placeholder, ...(field.type === "tel" ? { inputType: "tel" } : {}), ...(field.type === "select" ? { choices: field.options.map(value => ({label: value, value})) } : {}) }),
        })),
      } };
    });
}
