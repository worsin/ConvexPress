import type { CanonicalDocumentRead } from "@backend/canonical-blocks-foundation/documentContracts";

/** The saved source governs preview lifetime. Live resolver data and resolved
 * assets are renewed through the authorized preview channel, not source edits. */
export function previewSourceKey(value: CanonicalDocumentRead | undefined): string | null {
  if (value?.contract !== "canonical-document-v1") return null;
  const {blocks: _blocks, ...document} = value.document;
  return JSON.stringify({scope:value.scope,document,presentation:value.presentation,policy:value.policy});
}
