import { useMemo, useState } from "react";
import { parseCanonicalMigration, type CanonicalMigrationDto } from "@backend/canonical-blocks-foundation/migrationContracts";
import { CanonicalMigrationReview, type MigrationClient } from "./CanonicalMigrationReview";
import { NativeDocumentPreview } from "./NativeSavedPreview";
import type { DocumentKey } from "./session";

export type HistorySource = { revisionId: string; sourceKind: "saved" | "autosave" };
export interface HistoryImportClient {
  prepareRevisionImport(args: HistorySource & {request?: Record<string, string>}): Promise<unknown>;
  importRevision(args: HistorySource & Omit<Parameters<MigrationClient["migrate"]>[0], "preserveLegacyAutosave" | "expectedArchiveDigest"> & {expectedArchiveDigest: string}): Promise<unknown>;
  getRevisionSource(args: {revisionId: string}): Promise<unknown>;
}

export function CanonicalHistoryImport(props: {
  client: HistoryImportClient;
  documentKey: DocumentKey;
  revision: number;
  revisionId: string;
  hasRetainedAutosave: boolean;
  siteOrigin?: string;
  onImported: () => Promise<unknown>;
}) {
  const [sourceKind, setSourceKind] = useState<HistorySource["sourceKind"]>("saved");
  const source = useMemo(() => ({revisionId: props.revisionId, sourceKind}), [props.revisionId, sourceKind]);
  const client = useMemo<MigrationClient>(() => ({
    prepareMigration: () => props.client.prepareRevisionImport(source),
    migrate: ({expectedArchiveDigest, preserveLegacyAutosave: _unused, ...args}) => {
      if (!expectedArchiveDigest) throw new Error("Review the historical source before importing.");
      return props.client.importRevision({...args, ...source, expectedArchiveDigest});
    },
  }), [props.client, source]);
  return <div className="space-y-4">
    <p className="text-sm">Import a historical version into blocks. Current saved content and the exact original remain in history. Publication, URL and access settings stay unchanged. Import replaces the current content, including unsaved edits.</p>
    {props.hasRetainedAutosave && <label className="flex items-center gap-3 text-sm">Historical content
      <select aria-label="Historical content" value={sourceKind} onChange={event => setSourceKind(event.target.value as HistorySource["sourceKind"])} className="min-h-11 rounded border bg-background px-3">
        <option value="saved">Saved original</option><option value="autosave">Retained unsaved draft</option>
      </select>
    </label>}
    <CanonicalMigrationReview key={`${props.revisionId}:${sourceKind}:${props.revision}`}
      documentKey={props.documentKey} source={{document:{id:props.documentKey.documentId, revision:props.revision}}}
      archive={source} client={client} onMigrated={props.onImported}
      renderPreview={review => props.siteOrigin && <HistoricalPreview key={review.archive!.sourceDigest + review.source.authoringDigest}
        review={review} source={source} client={props.client} documentKey={props.documentKey} siteOrigin={props.siteOrigin} />} />
  </div>;
}
function HistoricalPreview(props: {review:CanonicalMigrationDto; source:HistorySource; client:HistoryImportClient; documentKey:DocumentKey; siteOrigin:string}) {
  const [open,setOpen] = useState(false);
  const read = useMemo(() => async (request?: Record<string,string>) => {
    const next = parseCanonicalMigration(await props.client.prepareRevisionImport({...props.source, ...(request ? {request} : {})}));
    const original = props.review;
    if (next.source.postId !== original.source.postId || next.source.revision !== original.source.revision ||
      next.source.authoringDigest !== original.source.authoringDigest || next.archive?.revisionId !== props.source.revisionId ||
      next.archive?.sourceKind !== props.source.sourceKind || next.archive?.sourceDigest !== original.archive?.sourceDigest ||
      next.candidate.document.digest !== original.candidate.document.digest || next.candidate.presentation.revision !== original.candidate.presentation.revision)
      throw new Error("The historical import changed. Close preview and refresh its review.");
    return next.candidate;
  },[props.client,props.source,props.review]);
  return <>
    <button type="button" className="min-h-11 rounded border px-4 text-sm" onClick={() => setOpen(true)}>Preview historical import on Website</button>
    {open && <NativeDocumentPreview document={props.review.candidate} documentKey={props.documentKey} siteOrigin={props.siteOrigin} read={read} proposal onClose={() => setOpen(false)} />}
  </>;
}
