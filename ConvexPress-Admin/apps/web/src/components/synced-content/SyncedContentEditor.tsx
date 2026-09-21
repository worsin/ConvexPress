import { useEffect, useMemo, useRef, useState } from "react";
import { useConvex, useQuery } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { validateCanonicalTree } from "@backend/canonical-blocks-foundation/generated/instances";
import { syncedContentDigest } from "@backend/canonical-blocks-foundation/syncedContent";
import { useVerifiedSiteRuntime } from "@/control/SiteRuntimeProvider";
import { useAuth } from "@/lib/auth-context";
import { useUnsavedChangesWarning } from "@/hooks/useUnsavedChangesWarning";
import { CanonicalEditor } from "../blocks/canonical-editor/CanonicalEditor";
import { canonicalEditorAdapter, checkedDraft, type CanonicalDraft } from "../blocks/canonical-editor/document-adapter";
import type { DocumentKey, Snapshot } from "../blocks/canonical-editor/session";
import { CanonicalResourcePicker, type CanonicalPickerRequest, type ResourcePickerClient } from "../blocks/canonical-editor/CanonicalResourcePicker";
import type { PickerResult } from "../blocks/schema-editor/model";

export function SyncedContentEditor({ id, onDirtyChange }: { id: Id<"syncedBlocks">; onDirtyChange: (dirty: boolean) => void }) {
  const { can } = useAuth(), runtime = useVerifiedSiteRuntime();
  if (!can("post.update") || !runtime?.target.websiteKey) return <p role="alert">Select an authorized website to edit synced content.</p>;
  return <ConnectedEditor key={`${id}:${runtime.generation}`} id={id} documentKey={{ websiteKey: runtime.target.websiteKey, instanceKey: runtime.target.instanceKey, documentId: id, generation: runtime.generation }} onDirtyChange={onDirtyChange} />;
}
function ConnectedEditor({ id, documentKey, onDirtyChange }: { id: Id<"syncedBlocks">; documentKey: DocumentKey; onDirtyChange: (dirty: boolean) => void }) {
  const client = useConvex(), read = useQuery(api.syncedBlocks.editor.get, { id });
  const [dirty, setDirty] = useState(false), [picker, setPicker] = useState<CanonicalPickerRequest | null>(null);
  const pending = useRef<((result: PickerResult | null) => void) | null>(null), active = useRef(true);
  const key = useMemo(() => documentKey, [documentKey.websiteKey, documentKey.instanceKey, documentKey.documentId, documentKey.generation]);
  useUnsavedChangesWarning({ isDirty: dirty || picker !== null, enabled: true });
  useEffect(() => { onDirtyChange(dirty || picker !== null); }, [dirty, picker, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);
  useEffect(() => { active.current = true; return () => { active.current = false; pending.current?.(null);pending.current = null; }; }, []);
  const guard = () => { if (!active.current) throw new Error("The native environment changed."); };
  const finishPicker = (result: PickerResult | null) => { pending.current?.(result);pending.current = null;setPicker(null); };
  useEffect(() => { finishPicker(null); }, [read?.generation]);
  const snapshot = useMemo<Snapshot<CanonicalDraft> | null>(() => {
    if (!read) return null;
    if (read.id !== key.documentId || read.scope.websiteKey !== key.websiteKey || read.scope.instanceKey !== key.instanceKey) throw new Error("The source belongs to another environment.");
    const blocks = validateCanonicalTree(read.blocks);
    if (syncedContentDigest(read.title, blocks) !== read.digest) throw new Error("The saved source failed its integrity check.");
    return { key, revision: read.generation, value: { title: read.title, blocks } };
  }, [read, key]);
  const adapter = useMemo(() => {
    const base = canonicalEditorAdapter(read?.policy ?? { enabledPlugins: [], capabilities: [], disabledBlocks: [] });
    return { ...base, prepareSave(value: CanonicalDraft) { return checkedDraft({ ...value, title: value.title.trim() }); }, validate(value: CanonicalDraft) { return !value.title.trim() ? "Enter a title for this reusable content." : base.validate?.(value) ?? null; } };
  }, [read?.policy]);
  const resourceClient = useMemo<ResourcePickerClient>(() => {
    const expectedGeneration = Number(picker?.revision);
    const owner = { syncedBlockId: id, expectedGeneration };
    const syncedArgs = { owner, expectedScope: { websiteKey: key.websiteKey, instanceKey: key.instanceKey } };
    async function guarded<T>(run: () => Promise<T>): Promise<T> { guard();const result = await run();guard();return result; }
    return {
      authorize: () => guarded(async () => {
        const current = await client.query(api.syncedBlocks.editor.get, { id });
        if (!picker || picker.signal.aborted || current.id !== key.documentId || current.scope.websiteKey !== key.websiteKey || current.scope.instanceKey !== key.instanceKey || current.generation !== expectedGeneration) throw new Error("The source changed. Reopen the picker.");
      }),
      syncedOptions: cursor => guarded(() => client.query(api.syncedBlocks.picker.sources, { ...syncedArgs, paginationOpts: { cursor, numItems: 8 } })),
      syncedRevisions: (sourceId, publishedRevision, cursor) => guarded(() => client.query(api.syncedBlocks.picker.revisions, { ...syncedArgs, sourceId: sourceId as Id<"syncedBlocks">, publishedRevision, paginationOpts: { cursor, numItems: 8 } })),
      syncedSelect: (sourceId, publishedRevision, revisionPolicy, revision) => guarded(() => client.query(api.syncedBlocks.picker.select, { ...syncedArgs, sourceId: sourceId as Id<"syncedBlocks">, publishedRevision, revisionPolicy, revision })),
      pageOptions: (cursor) => guarded(() => client.query(api.syncedBlocks.options.pageOptions, { ...owner, paginationOpts: { cursor, numItems: 20 } })),
      menuOptions: (cursor) => guarded(() => client.query(api.syncedBlocks.options.menuOptions, { ...owner, paginationOpts: { cursor, numItems: 20 } })),
      termOptions: (taxonomy, cursor) => guarded(() => client.query(api.syncedBlocks.options.termOptions, { ...owner, taxonomy, paginationOpts: { cursor, numItems: 20 } })),
      authorOptions: (cursor) => guarded(() => client.query(api.syncedBlocks.options.authorOptions, { ...owner, paginationOpts: { cursor, numItems: 20 } })),
      eventCategoryOptions: (cursor) => guarded(() => client.query(api.syncedBlocks.options.eventCategoryOptions, { ...owner, paginationOpts: { cursor, numItems: 20 } })),
      formOptions: (cursor) => guarded(() => client.query(api.syncedBlocks.options.formOptions, { ...owner, paginationOpts: { cursor, numItems: 20 } })),
      productOptions: (cursor) => guarded(() => client.query(api.syncedBlocks.options.productOptions, { ...owner, paginationOpts: { cursor, numItems: 20 } })),
      productTermOptions: (taxonomy, cursor) => guarded(() => client.query(api.syncedBlocks.options.productTermOptions, { ...owner, taxonomy, paginationOpts: { cursor, numItems: 20 } })),
      recipeOptions: (cursor) => guarded(() => client.query(api.syncedBlocks.options.recipeOptions, { ...owner, paginationOpts: { cursor, numItems: 20 } })),
      albumOptions: (cursor) => guarded(() => client.query(api.syncedBlocks.options.albumOptions, { ...owner, paginationOpts: { cursor, numItems: 20 } })),
      membershipPlanOptions: (cursor) => guarded(() => client.query(api.syncedBlocks.options.membershipPlanOptions, { ...owner, paginationOpts: { cursor, numItems: 20 } })),
      instructorOptions: (cursor) => guarded(() => client.query(api.syncedBlocks.options.instructorOptions, { ...owner, paginationOpts: { cursor, numItems: 6 } })),
      courseOptions: (cursor) => guarded(() => client.query(api.syncedBlocks.options.courseOptions, { ...owner, paginationOpts: { cursor, numItems: 6 } })),
      kbCategoryOptions: (cursor) => guarded(() => client.query(api.syncedBlocks.options.kbCategoryOptions, { ...owner, paginationOpts: { cursor, numItems: 20 } })),
      eventOptions: (cursor) => guarded(() => client.query(api.syncedBlocks.options.eventOptions, { ...owner, paginationOpts: { cursor, numItems: 20 } })),
      bundleOptions: (cursor) => guarded(() => client.query(api.syncedBlocks.options.bundleOptions, { ...owner, paginationOpts: { cursor, numItems: 20 } })),
      mailingListOptions: (cursor) => guarded(() => client.query(api.syncedBlocks.options.mailingListOptions, { ...owner, paginationOpts: { cursor, numItems: 20 } })),
      media: mediaId => guarded(async () => {
        const current = await client.query(api.syncedBlocks.editor.get, { id });
        if (current.generation !== expectedGeneration) throw new Error("The source changed.");
        const media = await client.query(api.media.queries.get, { mediaId });
        return media?.status === "active" ? { id: media._id, alt: media.altText } : null;
      }),
    };
  }, [client, id, key, picker]);
  if (!snapshot) return <p role="status">Opening the reusable block editor…</p>;
  return <>
    <CanonicalEditor snapshot={snapshot} authorityReady adapter={adapter} onDirtyChange={setDirty}
      save={async request => {
        guard();
        const value = checkedDraft(request.value), blocks = validateCanonicalTree(value.blocks);
        const result = await client.mutation(api.syncedBlocks.content.save, { id, expectedGeneration: request.revision, title: value.title, blocks });
        guard();
        const title = value.title.trim();
        if (result.id !== request.key.documentId || result.generation !== request.revision + (result.changed ? 1 : 0) || result.digest !== syncedContentDigest(title, blocks)) throw new Error("The saved source receipt could not be verified.");
        return { key: request.key, revision: result.generation, value: { title, blocks } };
      }}
      pickResource={request => {
        guard();
        if (request.signal.aborted || request.scope.websiteKey !== key.websiteKey || request.scope.instanceKey !== key.instanceKey) return Promise.resolve(null);
        pending.current?.(null);
        return new Promise(resolve => { pending.current = resolve;setPicker(request); });
      }} />
    {picker && <CanonicalResourcePicker key={`${picker.blockId}:${picker.revision}:${JSON.stringify(picker.path)}`} request={picker} client={resourceClient} onResult={finishPicker} />}
  </>;
}
