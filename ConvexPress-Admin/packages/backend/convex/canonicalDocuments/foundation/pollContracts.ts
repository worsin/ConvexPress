import { blockSchemas } from "./generated/schemas";
import { canonicalJson, sha256Hex } from "./shared/fingerprints";
import type { AttrsByName } from "./generated/types";

export type PollDefinition = AttrsByName["core/poll"];
export function parsePollDefinition(value: unknown): PollDefinition {
  const attrs = blockSchemas["core/poll"].parse(value);
  if (!attrs.question.trim() || attrs.options.length < 2)
    throw new Error("A poll needs a question and at least two choices.");
  const keys = new Set<string>(), labels = new Set<string>();
  for (const option of attrs.options) {
    if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,79}$/.test(option.key) || ["__proto__", "constructor", "prototype"].includes(option.key) || keys.has(option.key))
      throw new Error("Poll choice keys must be unique, beginning with a letter.");
    const label = option.label.trim();
    if (!label || labels.has(label)) throw new Error("Poll choices need distinct, nonempty labels.");
    keys.add(option.key); labels.add(label);
  }
  return attrs;
}

/** Changing the meaning of a question opens a distinct ballot. Reordering choices
 * or changing results visibility preserves votes; restoring content restores its
 * ballot. Presentation and author-supplied IDs never authorize a response. */
export function pollDefinitionVersion(attrs: PollDefinition): string {
  return sha256Hex(canonicalJson({
    question: attrs.question,
    options: [...attrs.options].sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0),
    responsePolicy: attrs.responsePolicy,
  }));
}
