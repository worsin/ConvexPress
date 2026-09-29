import { installedPromotionDefinition } from "../canonicalDocuments/foundation/installedPromotion";
import { currentLibrarySearchText, librarySearchNeedsData, librarySearchRecheckAt } from "../canonicalDocuments/foundation/librarySearch";
import type { CanonicalBlockInstance } from "../canonicalDocuments/foundation/generated/types";
import { planCanonicalData } from "../canonicalDocuments/foundation/planner";
import { readAuthor } from "../canonicalDocuments/author";
import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { RequestReadLedger, isRequestReadBudgetError } from "../helpers/requestReadLedger";
import { readStoredDocument } from "../canonicalDocuments/definitions";
import { displayContext } from "../canonicalDocuments/displayContext";
import { projectPublicBlocks } from "../canonicalDocuments/publicBlocks";
import { authoredBlockSearchText, authoredComposedSearchText, resolvedCompositionSearchText } from "../canonicalDocuments/foundation/searchText";
import { blockPresentationForPack } from "../canonicalDocuments/foundation/generated/metadata";
import { assertPackTreatments } from "../canonicalDocuments/foundation/generated/instances";
import { createComposedRegistry, type ComposedRegistry, type RuntimeCanonicalTree } from "../canonicalDocuments/foundation/composedRegistry";
import { loadPublishedComposedRegistry } from "../blockDefinitions/publishedRegistry";
import { resolveComposedPresentation, assertComposedReferenceBindings, COMPOSED_PRESENTATION_LIMITS } from "../canonicalDocuments/foundation/composedPresentation";
import { readCanonicalResources } from "../canonicalDocuments/resources";
import { resolveCanonicalPageData } from "../canonicalDocuments/data";
import { containsSyncedContent } from "../canonicalDocuments/foundation/syncedDisplay";
import { resolvePublishedOccurrences } from "../syncedBlocks/occurrences";
import { validateCanonicalTree } from "../canonicalDocuments/foundation/generated/instances";

/** Only declared Library copy and approved resolved composition prose enter
 * current search text. Child text follows the composition's actual slot. */
async function textFromTree(tree: RuntimeCanonicalTree, options: {
  authorAvailable?: (id: string, current: boolean) => Promise<boolean>;
  registry?: ComposedRegistry;
  renderLibrary?: (node: RuntimeCanonicalTree[number], children: () => Promise<string>) => Promise<string>;
  renderComposed?: (node: RuntimeCanonicalTree[number], children: () => Promise<string>) => Promise<string>;
} = {}): Promise<string> {
  const parts: string[] = [];
  let remaining = 100_000;
  for (const node of tree) {
    if (remaining <= 0) break;
    const children = () => textFromTree(node.children ?? [], options);
    let text: string;
    if (node.name.startsWith("composed/")) {
      const definition = options.registry?.definition(node.name, node.version);
      if (!definition) continue;
      text = options.renderComposed ? await options.renderComposed(node, children)
        : [authoredComposedSearchText(definition, node.attrs), await children()].filter(Boolean).join(" ");
    } else {
      if (node.name === "core/author-bio" && (node.attrs.userId || node.attrs.useCurrentAuthor) && options.authorAvailable && !await options.authorAvailable(node.attrs.userId || "", node.attrs.useCurrentAuthor === true)) continue;
      text = options.renderLibrary ? await options.renderLibrary(node, children) : [authoredBlockSearchText(node.name, node.attrs), await children()].filter(Boolean).join(" ");
    }
    text = text.slice(0, remaining);
    if (text) { parts.push(text); remaining -= text.length + 1; }
  }
  return parts.join(" ");
}

/** Internal candidate corpus only: membership is re-evaluated at query time so
 * entitled visitors can find restricted editorial text. Never serialize this
 * corpus as a search response or use it to validate a current visible match. */
export async function canonicalSearchCandidates(ctx: QueryCtx, post: Doc<"posts">): Promise<string> {
  const budget = new RequestReadLedger();
  const authored = await readStoredDocument(ctx, post, budget);
  if (!containsSyncedContent(authored.blocks)) return textFromTree(authored.blocks, { registry: authored.composedDefinitions ? createComposedRegistry(authored.composedDefinitions, authored.composedDefinitions.scope) : undefined });
  if (authored.composedDefinitions) return "";
  const plan = await resolvePublishedOccurrences(ctx, validateCanonicalTree(authored.blocks), budget);
  return textFromTree(plan.resolverTree);
}

/** Called only after the page's current publication/password/membership checks.
 * Shared per search request. Only selected custom data dependencies are resolved;
 * search-result-dependent branches are excluded to prevent recursive search.
 * Unavailable documents fail closed; budget exhaustion propagates. */
export function createCanonicalSearchTextReader(ctx: QueryCtx, budget: RequestReadLedger, now = Date.now()) {
  let context: Promise<Awaited<ReturnType<typeof displayContext>>> | undefined;
  const authors = new Map<string, Promise<boolean>>();
  const authorAvailable = (id: string, current: boolean, postId: string) => {
    const key = current ? `post:${postId}` : `user:${id}`;
    let result = authors.get(key);
    if (!result) { result = readAuthor(ctx, {userId:id,useCurrentAuthor:current}, budget, postId).then(value => value.author !== null); authors.set(key,result); }
    return result;
  };
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
        isVisible: node => !denied.has(node.name),
      });
      assertPackTreatments(projected.resolverTree, display.presentation.packId);
      // Match public rendering: unavailable selected media makes the document
      // unavailable, even when only an unrelated authored phrase matched.
      const resources = await readCanonicalResources(ctx, projected.resolverTree, budget, projected.composed);
      const approved = projected.composed
        ? await loadPublishedComposedRegistry(ctx, projected.resolverTree, projected.composed.definitions, budget) : undefined;
      let nodes = 0, bytes = 0;
      return await textFromTree(projected.resolverTree, {
        authorAvailable: (id, current) => authorAvailable(id, current, post._id),
        registry: approved?.registry,
        renderLibrary: async (node, children) => {
          const promoted = installedPromotionDefinition(node.name);
          budget.noteAuthorizationBoundary(librarySearchRecheckAt(node as CanonicalBlockInstance, now), now);
          const { children: _children, ...self } = node;
          const data = librarySearchNeedsData(node.name) || (promoted?.spec.data && promoted.spec.data.resolver!=="content.search") ? await resolveCanonicalPageData(ctx, [self], display.scope, display.policy, budget,
            { document: post, tree: projected.resolverTree, authoringTree: projected.authoringTree, composed: projected.composed }) : undefined;
          if (promoted) {
            const binding = planCanonicalData([self], display.scope, display.policy).bindings.find(item=>item.blockId===node.id);
            assertComposedReferenceBindings(promoted,node.attrs,binding?.args,Boolean(data?.dataByBlock[node.id]));
            const presentation = resolveComposedPresentation(promoted,node.attrs,{packId:display.presentation.packId,data:data?.dataByBlock[node.id]?.data,childCount:node.children?.length??0,
              readMedia:id=>Object.prototype.hasOwnProperty.call(resources.media,id)?resources.media[id]:undefined,omitDataDependentNodes:promoted.spec.data?.resolver==='content.search'});
            nodes+=presentation.nodes;bytes+=presentation.bytes;
            if(nodes>COMPOSED_PRESENTATION_LIMITS.pageNodes||bytes>COMPOSED_PRESENTATION_LIMITS.pageBytes)throw Error('Promoted search presentation exceeds page budget');
            return resolvedCompositionSearchText(presentation.root,await children());
          }
          return [currentLibrarySearchText(node as CanonicalBlockInstance, { now, resources, data: data?.dataByBlock[node.id] }),await children()].filter(Boolean).join(' ');
        },
        renderComposed: approved ? async (node, children) => {
          const definition = approved.registry.definition(node.name, node.version)!;
          // Search result bodies depend on the incoming query and cannot become
          // their own corpus. Keep independent authored siblings and child slots.
          const recursiveSearch = definition.spec.data?.resolver === "content.search";
          const { children: _children, ...self } = node;
          const selected = [self];
          const custom = { scope: approved.snapshot.scope, definitions: approved.registry.snapshotFor(selected) };
          const data = definition.spec.data && !recursiveSearch ? await resolveCanonicalPageData(ctx, selected, display.scope, display.policy, budget,
            { document: post, tree: projected.resolverTree, authoringTree: projected.authoringTree, composed: projected.composed }, {}, undefined, [], custom) : undefined;
          const binding = planCanonicalData(selected, display.scope, display.policy, {}, custom).bindings.find(item => item.blockId === node.id);
          assertComposedReferenceBindings(definition, node.attrs, binding?.args, Boolean(data?.dataByBlock[node.id]));
          const resources = await readCanonicalResources(ctx, selected, budget, custom);
          const presentation = resolveComposedPresentation(definition, node.attrs, { packId: display.presentation.packId,
            omitDataDependentNodes: recursiveSearch, data: data?.dataByBlock[node.id]?.data, childCount: node.children?.length ?? 0,
            readMedia: id => Object.prototype.hasOwnProperty.call(resources.media, id) ? resources.media[id] : undefined });
          nodes += presentation.nodes; bytes += presentation.bytes;
          if (nodes > COMPOSED_PRESENTATION_LIMITS.pageNodes || bytes > COMPOSED_PRESENTATION_LIMITS.pageBytes) throw Error("Custom search presentation exceeds page budget");
          return resolvedCompositionSearchText(presentation.root, await children());
        } : undefined,
      });
    } catch (error) {
      if (isRequestReadBudgetError(error)) throw error;
      return "";
    }
  };
}
