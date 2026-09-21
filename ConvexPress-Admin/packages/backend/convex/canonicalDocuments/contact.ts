import type { QueryCtx } from "../_generated/server";
import { RequestReadLedger } from "../helpers/requestReadLedger";
import { contactArgsSchema, type ContactArgs, type ContactResult } from "./foundation/contactDataContracts";
import { validateCanonicalTree } from "./foundation/generated/instances";
import { createComposedRegistry, type RuntimeCanonicalTree } from "./foundation/composedRegistry";
import type { ComposedDataContext } from "./foundation/planner";
import { parseContactDefinition } from "./foundation/contactContracts";
import { stableKey } from "./foundation/contracts";
import type { NavigationSource } from "./navigation";
import { readForm } from "./form";

/** Only the authorized document service creates source. Visitor/author attrs
 * cannot select another post or arbitrary backing form. Public authority is
 * checked again by readForm against the actual persisted source. */
export async function readContact(ctx: QueryCtx, input: ContactArgs, source: NavigationSource, budget = new RequestReadLedger(), password?: string, composed?: ComposedDataContext): Promise<ContactResult> {
  const args = contactArgsSchema.parse(input);
  const missing: ContactResult = { blockId: args.blockId, form: null, asOf: Date.now(), nextChangeAt: null };
  const find = (nodes: RuntimeCanonicalTree): RuntimeCanonicalTree[number] | undefined => {
    for (const node of nodes) {
      if (node.id === args.blockId) return node;
      const child = node.children && find(node.children);
      if (child) return child;
    }
  };
  const tree = composed ? createComposedRegistry(composed.definitions, composed.scope).validateTree(source.tree) : validateCanonicalTree(source.tree);
  const node = find(tree);
  if (!node || node.name !== "core/contact-form") return missing;
  const attrs = parseContactDefinition(node.attrs);
  budget.beforeRead();
  const form = budget.record(await ctx.db.query("forms").withIndex("by_contact_source", q => q.eq("contactPostId", source.document._id).eq("contactBlockId", args.blockId)).unique());
  // Unsaved native previews must not display the old projection as the new one.
  if (!form || form.contactDefinition !== stableKey(attrs)) return missing;
  return { ...await readForm(ctx, { form: form._id }, budget, password), blockId: args.blockId };
}
