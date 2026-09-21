import { blockSchemas } from "./generated/schemas";
import type { AttrsByName } from "./generated/types";

export type ContactDefinition = AttrsByName["core/contact-form"];
export class ContactDefinitionError extends Error {
  constructor(public readonly field: string, message: string) { super(message); this.name = "ContactDefinitionError"; }
}
/** The authored contract is generated once. These cross-field constraints also
 * protect its eventual Forms projection from ambiguous or prototype field keys. */
export function parseContactDefinition(value: unknown): ContactDefinition {
  const attrs = blockSchemas["core/contact-form"].parse(value);
  const names = new Set<string>();
  for (const [index, field] of attrs.fields.entries()) {
    const at = `fields.${index}`;
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/.test(field.name) || ["__proto__", "prototype", "constructor"].includes(field.name))
      throw new ContactDefinitionError(`${at}.name`, "Use a field name beginning with a letter, followed by letters, numbers or underscores.");
    if (names.has(field.name)) throw new ContactDefinitionError(`${at}.name`, "Each contact field needs a unique name.");
    names.add(field.name);
    if (!field.label.trim()) throw new ContactDefinitionError(`${at}.label`, "Give each field a visible label.");
    if (field.type === "select" && (!field.options.length || field.options.some(option => !option.trim()) || new Set(field.options).size !== field.options.length))
      throw new ContactDefinitionError(`${at}.options`, "Choice fields need nonempty, unique options.");
    if (field.type !== "select" && field.options.length) throw new ContactDefinitionError(`${at}.options`, "Only choice fields accept options.");
  }
  // A recipient is configuration, never a browser-supplied submission argument.
  const recipient = attrs.recipientEmail.trim();
  if (recipient && (!/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(recipient) || /[\r\n]/.test(recipient)))
    throw new ContactDefinitionError("recipientEmail", "Enter one valid recipient email address.");
  return { ...attrs, recipientEmail: recipient };
}
