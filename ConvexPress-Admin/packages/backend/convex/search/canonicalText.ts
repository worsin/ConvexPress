import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { RequestReadLedger, isRequestReadBudgetError } from "../helpers/requestReadLedger";
import { readStoredDocument } from "../canonicalDocuments/definitions";
import { displayContext } from "../canonicalDocuments/displayContext";
import { projectPublicBlocks } from "../canonicalDocuments/publicBlocks";
import { authoredBlockSearchText } from "../canonicalDocuments/foundation/searchText";
import { blockPresentationForPack } from "../canonicalDocuments/foundation/generated/metadata";
import { assertPackTreatments } from "../canonicalDocuments/foundation/generated/instances";
import type { RuntimeCanonicalTree } from "../canonicalDocuments/foundation/composedRegistry";
import { containsSyncedContent } from "../canonicalDocuments/foundation/syncedDisplay";
import { resolvePublishedOccurrences } from "../syncedBlocks/occurrences";
import { validateCanonicalTree } from "../canonicalDocuments/foundation/generated/instances";

/** Never returns attributes, reference IDs, URL targets or private form settings.
 * Custom composition needs its own resolved text projection; do not guess from
 * its field names or traverse a child slot whose placement has not been resolved. */
function textFromTree(tree: RuntimeCanonicalTree): string {
  const parts: string[] = [];
  let remaining = 100_000;
  const visit = (nodes: RuntimeCanonicalTree) => {
    for (const node of nodes) {
      if (remaining <= 0) return;
      if (node.name.startsWith("composed/")) continue;
      const text = authoredBlockSearchText(node.name, node.attrs).slice(0, remaining);
      if (text) { parts.push(text); remaining -= text.length + 1; }
      if (node.children) visit(node.children);
    }
  };
  visit(tree);
  return parts.join(" ");
}

/** Internal candidate corpus only: membership is re-evaluated at query time so
 * entitled visitors can find restricted editorial text. Never serialize this
 * corpus as a search response or use it to validate a current visible match. */
export async function canonicalSearchCandidates(ctx: QueryCtx, post: Doc<"posts">): Promise<string> {
  const budget = new RequestReadLedger();
  const authored = await readStoredDocument(ctx, post, budget);
  if (!containsSyncedContent(authored.blocks)) return textFromTree(authored.blocks);
  if (authored.composedDefinitions) return "";
  const plan = await resolvePublishedOccurrences(ctx, validateCanonicalTree(authored.blocks), budget);
  return textFromTree(plan.resolverTree);
}

/** Called only after the page's current publication/password/membership checks.
 * Shared per search request; no renderer/data execution, hence no nested-search
 * recursion. Unavailable documents fail closed; budget exhaustion propagates. */
export function createCanonicalSearchTextReader(ctx: QueryCtx, budget: RequestReadLedger) {
  let context: Promise<Awaited<ReturnType<typeof displayContext>>> | undefined;
  return async (post: Doc<"posts">): Promise<string> => {
    if (!post.blocks?.length) return "";
    try {
      const authored = await readStoredDocument(ctx, post, budget);
      context ??= displayContext(ctx, budget);
      const display = await context;
      const denied = new Set([...display.policy.disabledBlocks, ...blockPresentationForPack(display.presentation.packId).hidden]);
      const composed = authored.composedDefinitions ? { scope: authored.composedDefinitions.scope, definitions: authored.composedDefinitions } : undefined;
      const projected = await projectPublicBlocks(ctx, authored.blocks, display.scope, display.policy, budget, {
        composed,
        isVisible: node => !node.name.startsWith("composed/") && !denied.has(node.name),
      });
      assertPackTreatments(projected.resolverTree, display.presentation.packId);
      return textFromTree(projected.resolverTree);
    } catch (error) {
      if (isRequestReadBudgetError(error)) throw error;
      return "";
    }
  };
}
