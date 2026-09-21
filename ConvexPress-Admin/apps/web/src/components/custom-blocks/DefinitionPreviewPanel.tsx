import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useConvex, usePaginatedQuery } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { useVerifiedSiteRuntime } from "@/control/SiteRuntimeProvider";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { checkedEdit, checkedSaved, type SavedDefinition } from "./model";
import { composedAttrsSchema, type ComposedDefinition } from "@backend/canonical-blocks-foundation/composedDefinitions";
import { parseCanonicalDocumentRead, type CanonicalDocumentDto } from "@backend/canonical-blocks-foundation/documentContracts";
import { SchemaBlockForm } from "../blocks/schema-editor/SchemaBlockForm";
import { definitionEditorContract } from "../blocks/schema-editor/composed-contract";
import { NativeDocumentPreview } from "../blocks/canonical-editor/NativeSavedPreview";
import { CanonicalResourcePicker, type CanonicalPickerRequest, type ResourcePickerClient } from "../blocks/canonical-editor/CanonicalResourcePicker";
import type { PickerResult, Draft } from "../blocks/schema-editor/model";

export function DefinitionPreviewPanel(props: { saved: SavedDefinition; source: string | null; disabled: boolean }) {
  const runtime = useVerifiedSiteRuntime(), { can } = useAuth();
  const value = useMemo(() => { try { return props.source === null ? checkedSaved(props.saved) : checkedEdit(props.source, props.saved); } catch { return null; } }, [props.source, props.saved]);
  if (!runtime || !value || !can("blocks.compose") || !can("post.read")) return null;
  return <PreviewContent key={`${runtime.generation}:${props.saved.generation}:${value.digest}`} {...props} definition={value.definition} scope={{ websiteKey: runtime.target.websiteKey!, instanceKey: runtime.target.instanceKey }} generation={runtime.generation} siteOrigin={runtime.target.siteOrigin} />;
}
function PreviewContent({ saved, source, disabled, definition, scope, generation, siteOrigin }: { saved: SavedDefinition; source: string | null; disabled: boolean; definition: ComposedDefinition; scope: { websiteKey: string; instanceKey: string }; generation: string; siteOrigin: string }) {
  const convex = useConvex(), id = useId();
  const options = usePaginatedQuery(api.blockDefinitions.preview.pages, { id: saved.id }, { initialNumItems: 5 });
  const [postId, setPostId] = useState<Id<"posts"> | "">("");
  const [attrs, setAttrs] = useState<Draft>(() => composedAttrsSchema(definition).parse(definition.spec.examples[0]) as Draft);
  const initialAttrs = useRef(attrs);
  const [document, setDocument] = useState<CanonicalDocumentDto | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [picker, setPicker] = useState<CanonicalPickerRequest | null>(null);
  const alive = useRef(true), ticket = useRef(0), pendingPick = useRef<((value: PickerResult | null) => void) | null>(null);
  const selected = options.results.find(item => item.id === postId);
  const authority = { id: saved.id, expectedGeneration: saved.generation, version: saved.version, expectedDigest: saved.digest };
  const contract = useMemo(() => definitionEditorContract(definition), [definition]);
  const attrsJson = JSON.stringify(attrs);
  const request = useMemo(() => selected ? { ...authority, postId: selected.id, expectedRevision: selected.revision, ...(source === null ? {} : { definitionJson: source }), attrsJson } : null, [selected?.id, selected?.revision, saved.id, saved.generation, saved.version, saved.digest, source, attrsJson]);
  const requestRef = useRef(request);requestRef.current = request;
  const valid = composedAttrsSchema(definition).safeParse(attrs).success;
  useEffect(() => { alive.current = true;return () => { alive.current = false;ticket.current++;pendingPick.current?.(null);pendingPick.current = null; }; }, []);
  useEffect(() => { ticket.current++;setDocument(null);setError("");setBusy(false);pendingPick.current?.(null);pendingPick.current = null;setPicker(null); }, [request, disabled]);
  const read = useMemo(() => async (pageRequest?: Record<string, string>) => {
    if (!request || !alive.current || requestRef.current !== request) throw Error("The preview context changed.");
    const value = await convex.query(api.blockDefinitions.preview.get, { ...request, ...(pageRequest ? { request: pageRequest } : {}) });
    if (!alive.current || requestRef.current !== request) throw Error("The preview context changed.");
    return value;
  }, [convex, request]);
  async function authorize() {
    if (!selected || !alive.current || !picker || picker.signal.aborted) throw Error("Select a current preview page.");
    const [current, page] = await Promise.all([convex.query(api.blockDefinitions.drafts.get, { id: saved.id, version: saved.version }), convex.query(api.canonicalDocuments.get, { postId: selected.id })]);
    if (!alive.current || !page || current.generation !== saved.generation || current.digest !== saved.digest || page.document.revision !== selected.revision || page.scope.websiteKey !== scope.websiteKey || page.scope.instanceKey !== scope.instanceKey) throw Error("The definition or preview page changed.");
  }
  const resourceClient = useMemo<ResourcePickerClient>(() => {
    const requirePage = () => { if (!selected || !alive.current) throw Error("Select a preview page.");return { postId: selected.id }; };
    async function guarded<T>(run: () => Promise<T>) { await authorize();const result = await run();await authorize();return result; }
    const paginationOpts = (cursor: string | null, numItems = 20) => ({ cursor, numItems });
    const syncedArgs = () => ({ owner: { ...requirePage(), expectedRevision: selected!.revision }, expectedScope: scope });
    return {
      authorize,
      syncedOptions: cursor => guarded(() => convex.query(api.syncedBlocks.picker.sources, { ...syncedArgs(), paginationOpts: paginationOpts(cursor, 8) })),
      syncedRevisions: (sourceId, publishedRevision, cursor) => guarded(() => convex.query(api.syncedBlocks.picker.revisions, { ...syncedArgs(), sourceId: sourceId as Id<"syncedBlocks">, publishedRevision, paginationOpts: paginationOpts(cursor, 8) })),
      syncedSelect: (sourceId, publishedRevision, revisionPolicy, revision) => guarded(() => convex.query(api.syncedBlocks.picker.select, { ...syncedArgs(), sourceId: sourceId as Id<"syncedBlocks">, publishedRevision, revisionPolicy, revision })),
      pageOptions: cursor => guarded(() => convex.query(api.canonicalDocuments.pageOptions, { ...requirePage(), paginationOpts: paginationOpts(cursor) })),
      menuOptions: cursor => guarded(() => convex.query(api.canonicalDocuments.menuOptions, { ...requirePage(), paginationOpts: paginationOpts(cursor) })),
      termOptions: (taxonomy, cursor) => guarded(() => convex.query(api.canonicalDocuments.termOptions, { ...requirePage(), taxonomy, paginationOpts: paginationOpts(cursor) })),
      authorOptions: cursor => guarded(() => convex.query(api.canonicalDocuments.authorOptions, { ...requirePage(), paginationOpts: paginationOpts(cursor) })),
      instructorOptions: cursor => guarded(() => convex.query(api.canonicalDocuments.instructorOptions, { ...requirePage(), paginationOpts: paginationOpts(cursor, 6) })),
      courseOptions: cursor => guarded(() => convex.query(api.canonicalDocuments.courseOptions, { ...requirePage(), paginationOpts: paginationOpts(cursor, 6) })),
      kbCategoryOptions: cursor => guarded(() => convex.query(api.canonicalDocuments.kbCategoryOptions, { ...requirePage(), paginationOpts: paginationOpts(cursor) })),
      formOptions: cursor => guarded(() => convex.query(api.canonicalDocuments.formOptions, { ...requirePage(), paginationOpts: paginationOpts(cursor) })),
      eventCategoryOptions: cursor => guarded(() => convex.query(api.canonicalDocuments.eventCategoryOptions, { ...requirePage(), paginationOpts: paginationOpts(cursor) })),
      productOptions: cursor => guarded(() => convex.query(api.canonicalDocuments.productOptions, { ...requirePage(), paginationOpts: paginationOpts(cursor) })),
      productTermOptions: (taxonomy, cursor) => guarded(() => convex.query(api.canonicalDocuments.productTermOptions, { ...requirePage(), taxonomy, paginationOpts: paginationOpts(cursor) })),
      recipeOptions: cursor => guarded(() => convex.query(api.canonicalDocuments.recipeOptions, { ...requirePage(), paginationOpts: paginationOpts(cursor) })),
      albumOptions: cursor => guarded(() => convex.query(api.canonicalDocuments.albumOptions, { ...requirePage(), paginationOpts: paginationOpts(cursor) })),
      membershipPlanOptions: cursor => guarded(() => convex.query(api.canonicalDocuments.membershipPlanOptions, { ...requirePage(), paginationOpts: paginationOpts(cursor) })),
      eventOptions: cursor => guarded(() => convex.query(api.canonicalDocuments.eventOptions, { ...requirePage(), paginationOpts: paginationOpts(cursor) })),
      bundleOptions: cursor => guarded(() => convex.query(api.canonicalDocuments.bundleOptions, { ...requirePage(), paginationOpts: paginationOpts(cursor) })),
      mailingListOptions: cursor => guarded(() => convex.query(api.canonicalDocuments.mailingListOptions, { ...requirePage(), paginationOpts: paginationOpts(cursor) })),
      media: mediaId => guarded(async () => { const value = await convex.query(api.media.queries.get, { mediaId });return value?.status === "active" ? { id: value._id, alt: value.altText, label: value.fileName } : null; }),
    };
  }, [convex, selected?.id, selected?.revision, saved.id, saved.generation, saved.digest, picker]);
  const finishPick = (value: PickerResult | null) => { pendingPick.current?.(value);pendingPick.current = null;setPicker(null); };
  return <section className="space-y-3 rounded-lg border border-border p-4" aria-label="Custom block preview"><h3 className="font-semibold">Try it on your Website</h3><p className="text-sm text-muted-foreground">Choose a page for its site context and live data. Sample content is temporary; previewing changes neither the page nor the saved definition.</p>
    <label htmlFor={id} className="block text-sm font-medium">Preview page</label><select id={id} className="min-h-11 w-full rounded-md border border-input bg-background px-3" disabled={disabled || busy} value={postId} onChange={event => setPostId(event.target.value as Id<"posts"> | "")}><option value="">Choose a page</option>{options.results.map(item => <option key={item.id} value={item.id}>{item.title || "Untitled page"}</option>)}</select>
    {options.status !== "Exhausted" && <div><Button type="button" variant="outline" size="sm" disabled={disabled || options.status === "LoadingMore" || options.status === "LoadingFirstPage"} onClick={() => options.loadMore(5)}>{options.status === "LoadingFirstPage" || options.status === "LoadingMore" ? "Loading pages…" : "Load more pages"}</Button></div>}
    {options.status === "Exhausted" && !options.results.length && <p className="text-sm text-muted-foreground">Create an editable page in this website to use as preview context.</p>}
    {selected && <details><summary className="cursor-pointer text-sm font-medium">Sample content</summary><SchemaBlockForm mode="preview" contract={contract} blockId="definition-preview" name={definition.spec.name} version={definition.spec.version} value={initialAttrs.current} revision={String(saved.generation)} scope={scope} disabled={disabled || busy} onDraftChange={next => setAttrs(next.draft)} pickResource={input => new Promise(resolve => { pendingPick.current?.(null);pendingPick.current = resolve;setPicker(input); })} /></details>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <Button type="button" variant="outline" disabled={disabled || busy || !request || !valid} onClick={async () => { const attempt = ++ticket.current;setBusy(true);setError("");try { const result = parseCanonicalDocumentRead(await read());if (!result || result.contract !== "canonical-document-v1") throw Error("Unavailable preview");if (alive.current && attempt === ticket.current) setDocument(result); } catch { if (alive.current && attempt === ticket.current) setError("Preview could not be verified. Check the sample content, required features and current page revision."); } finally { if (alive.current && attempt === ticket.current) setBusy(false); } }}>{busy ? "Preparing preview…" : "Preview custom block"}</Button>
    {document && selected && !disabled && <NativeDocumentPreview document={document} documentKey={{ ...scope, documentId: selected.id, generation }} siteOrigin={siteOrigin} read={read} proposal definition onClose={() => setDocument(null)} />}
    {picker && <CanonicalResourcePicker request={picker} client={resourceClient} onResult={finishPick} />}
  </section>;
}
