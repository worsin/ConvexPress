import type { RuntimeCanonicalTree } from "./foundation/composedRegistry";
import { ConvexError } from "convex/values";
import { ContactDefinitionError, parseContactDefinition, type ContactDefinition } from "./foundation/contactContracts";

export type DocumentContactDefinition = { blockId: string; attrs: ContactDefinition };

/** Caller supplies a validated tree. For reused content this must be the
 * occurrence tree, so projection IDs agree with rendering and submissions. */
export function collectContactDefinitions(tree: RuntimeCanonicalTree): DocumentContactDefinition[] {
  const contacts: DocumentContactDefinition[] = [];
  function visit(nodes: RuntimeCanonicalTree): void {
    for (const node of nodes) {
      if (node.name === "core/contact-form") {
        try { contacts.push({ blockId: node.id, attrs: parseContactDefinition(node.attrs) }); }
        catch (error) {
          if (!(error instanceof ContactDefinitionError)) throw error;
          throw new ConvexError({ code: "CONTACT_FORM_CONFIGURATION", message: error.message, blockId: node.id, field: error.field });
        }
      }
      if (node.children) visit(node.children);
    }
  }
  visit(tree);
  return contacts;
}
