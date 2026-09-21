import type { QueryCtx } from "../_generated/server";
import { loadAuthoringComposedRegistry } from "../blockDefinitions/registry";
import { loadPublishedComposedRegistry } from "../blockDefinitions/publishedRegistry";
import { installation } from "../syncedBlocks/model";
import type { RequestReadLedger } from "../helpers/requestReadLedger";
import { composedDefinitionRequests } from "./foundation/composedRegistry";
import { parseAuthoredDefinitionContent } from "./foundation/authoredDefinitions";
import type { ComposedWriteContext } from "./foundation/documentState";
import { CanonicalDataError } from "./foundation/contracts";

/** Authoring authority comes from the current authenticated installation store,
 * never from a schema/definition supplied with an editor write. */
export async function loadDocumentWriteContext(ctx: QueryCtx, tree: unknown, budget: RequestReadLedger, previousDefinitions?: unknown): Promise<ComposedWriteContext | undefined> {
  if (composedDefinitionRequests(tree).length) {
    const loaded = await loadAuthoringComposedRegistry(ctx, tree, budget);
    return { scope: loaded.snapshot.scope, definitions: loaded.snapshot };
  }
  // Removing the final custom block still needs the current installation to
  // validate the previous snapshot and clear it deliberately in the same save.
  return previousDefinitions === undefined ? undefined : { scope: await installation(ctx, budget) };
}

/** Authenticated editor read/preflight. Historical versions stay exact even
 * after the definition head changes, but a forged stored snapshot cannot run. */
export async function readAuthoredDocument(ctx: QueryCtx, value: { title: unknown; blocks?: unknown; composedDefinitions?: unknown }, budget: RequestReadLedger) {
  const candidate = { ...value, blocks: value.blocks };
  if (value.composedDefinitions === undefined) return parseAuthoredDefinitionContent(candidate);
  const loaded = await loadAuthoringComposedRegistry(ctx, value.blocks, budget);
  const stored = parseAuthoredDefinitionContent(candidate, loaded.snapshot.scope);
  const trusted = parseAuthoredDefinitionContent({ title: value.title, blocks: loaded.blocks, composedDefinitions: loaded.snapshot }, loaded.snapshot.scope);
  if (stored.digest !== trusted.digest)
    throw new CanonicalDataError("DEFINITION_INTEGRITY", "document", "Saved definitions differ from their immutable site versions");
  return stored;
}

/** Parse stored content only after its page access is established. Definition
 * approval is separate and must precede dependent data/media reads. */
export async function readStoredDocument(ctx: QueryCtx, value: { title: unknown; blocks?: unknown; composedDefinitions?: unknown }, budget: RequestReadLedger) {
  return parseAuthoredDefinitionContent({ ...value, blocks: value.blocks }, value.composedDefinitions === undefined ? undefined : await installation(ctx, budget));
}

/** Publication/scheduler preflight requires approval for the complete authored
 * tree, including blocks which may become visible to a different visitor. */
export async function readApprovedDocument(ctx: QueryCtx, value: { title: unknown; blocks?: unknown; composedDefinitions?: unknown }, budget: RequestReadLedger) {
  const stored = await readStoredDocument(ctx, value, budget);
  if (!stored.composedDefinitions) return stored;
  const loaded = await loadPublishedComposedRegistry(ctx, stored.blocks, stored.composedDefinitions, budget);
  return parseAuthoredDefinitionContent({ title: stored.title, blocks: loaded.blocks, composedDefinitions: loaded.snapshot }, loaded.snapshot.scope);
}
