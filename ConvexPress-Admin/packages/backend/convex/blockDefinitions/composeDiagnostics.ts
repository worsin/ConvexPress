import { decodeComposedDefinition } from "../canonicalDocuments/foundation/composedDefinitions";
import { validateComposition } from "../canonicalDocuments/foundation/composition";

/** Feedback describes the rejected, untrusted proposal, never a grant or a
 * replacement for authoritative validation. Bound both processing and output. */
export function composeDiagnostics(json: string, failure: unknown): string[] {
  const issues = new Set<string>();
  const add = (error: unknown) => issues.add((error instanceof Error ? error.message : "Invalid definition").replace(/\s+/g, " ").slice(0, 600));
  add(failure);
  if (new TextEncoder().encode(json).length <= 64 * 1024) {
    try { decodeComposedDefinition(json); } catch (error) { add(error); }
    // A field error can mask a separate grammar error. Report both in the one
    // correction request rather than asking the provider to fix them serially.
    try { validateComposition(JSON.parse(json).composition); } catch (error) { add(error); }
  }
  return [...issues].slice(0, 4);
}
