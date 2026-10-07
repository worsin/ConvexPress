/** Current-storage prose for domain reader/security fixtures. The full body stays
 * in canonical blocks so byte-budget and non-disclosure assertions stay meaningful. */
export function canonicalPostBody(text: string) {
  return {
    blocksVersion: 2,
    blocksRevision: 1,
    blocks: [{ id: "fixture-prose", name: "core/paragraph", version: 2,
      attrs: { body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] } } }],
  };
}
