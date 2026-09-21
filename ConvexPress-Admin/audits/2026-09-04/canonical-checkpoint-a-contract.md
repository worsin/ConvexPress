# Canonical document checkpoint A: shared implementation contract

Date: 2026-09-05. Root approved this as an **intermediate implementation gate** after review of `canonical-document-vertical-integration-plan.md`. This artifact pins the frontend/backend boundary; it does not claim these endpoints, validators, or routes already exist. Backend source remains frozen for the combined media/roles/duplicate deployment snapshot. Only this document is being written during that hold.

Owners: auth/runtime owns generated instance/document contracts, backend storage, authority/read budgets, mutations and writer fences. Content/Website owns the generated-editor consumer, bounded picker adapters and native-owned Website display channel. Root owns the current legacy duplicate repair, deployment, actual native/browser acceptance and final activation decisions. Do not modify root's duplicate handler/import/test hunks concurrently.

## 1. Persisted format and authoritative types

Use existing `posts.blocks` with `blocksVersion: 2`, `contentMode: "blocks"` and a server-owned nonnegative safe-integer `blocksRevision`. Envelope version 2 is independent of each block's specification version. No canonical body is duplicated into TipTap or `pageSections`. Existing legacy fields remain until their migration is proven; no bulk field removal is part of checkpoint A.

The generated recursive `CanonicalBlockInstance` owns these exact keys:

```ts
type CanonicalBlockInstance = {
  id: string;
  name: BlockName;
  version: number;
  attrs: AttrsByName[BlockName]; // generated name/attrs correlation, not a handwritten union
  children?: CanonicalBlockInstance[];
  layout?: {
    width?: "contained" | "wide" | "full";
    tone?: "default" | "muted" | "inverted" | "accent";
    spacing?: "none" | "compact" | "default" | "spacious";
    align?: "start" | "center";
  };
  style?: string;
  visibility?: "everyone" | "signedIn" | "signedOut";
  lock?: { move?: boolean; remove?: boolean; edit?: boolean };
  anchor?: string;
};
```

The real generated TypeScript type must correlate `name` and attrs through the existing generated `AttrsByName`; the display above describes the contract, not permission to copy a second persisted interface into either app. Visibility reuses the **actual menu union**, not an invented object rule. Extract its unchanged literals into a lightweight shared pure source consumed by both validators; do not create two independently maintained vocabularies.

Validation is closed and recursive: reject unknown keys, legacy `innerBlocks`, unknown names, wrong per-block versions, invalid attrs, unsupported children/layout/anchor, duplicate IDs and duplicate page-wide authored DOM IDs. Preserve RichTextDoc marks/links/hard breaks and array order. Node IDs keep the current `^[A-Za-z][A-Za-z0-9_-]{0,127}$` contract; DOM anchors keep `^[A-Za-z][A-Za-z0-9_-]{0,100}$`. Apply current common limits of 80 nodes, eight levels and 512 KiB serialized tree; do not silently truncate.

Checkpoint A initially accepts absent/default style, absent/`everyone` visibility and absent or inactive locks. Non-default visibility, active locks and named styles must fail with a specific unsupported-feature error while their semantics are unavailable. The complete type stays intact. Broader acceptance requires actual visibility filtering **before dependent resolution**, mutation-side lock enforcement and matching renderer/editor behavior. A parsed field is not an implemented policy.

The Convex schema may use a structural node envelope with recursive children validated at runtime, because its validator cannot express every generated recursive constraint. Every v2 read/write/restore boundary must run the same full canonical validator. Neither a schema union nor `v.any()` is proof of canonical validity. A missing version means legacy version 1 only; unknown versions refuse rather than falling through to a legacy converter.

## 2. Generation and pure anchor metadata

Extend the existing `scripts/blocks/generator.mjs`, `backend-foundation.mjs` and `portable-data.mjs` pipeline. Proposed pure sources are `scripts/blocks/instance-runtime.mjs` and its declaration; the existing generator emits `instance-runtime.mjs`, its declaration and generated instance/type exports alongside current attrs schemas. No separate registry, direct React import or manually copied canonical schema is allowed.

Public consumer paths after implementation:

- Admin canonical instances: root `blocks/.generated/types.ts` and generated instance validator.
- Backend: isolated generated copies inside its deployed canonical module closure, produced from the same generator. Existing staged foundation remains the source for resolver/DTO logic, with a deterministic deployment copy/closure check rather than a maintained fork.
- Website: existing `src/templates/sdk/block-data/portable/` closure extended to include the pure instance and document contracts. It must exclude `server.ts`, source-budget/server authorization code and the deployed Convex graph.

Add a closed, optional field annotation `domId: true` to canonical field specifications. It is permitted only on text fields and explicitly means **this value is emitted as a DOM id**, not merely a link destination. Generated `anchorDescriptors` contain exact nested field paths (including repeater `*`), unset handling and identifier limits. Current concrete producers are `core/heading.attrs.anchor` and `core/footnotes.attrs.notes[*].key`; preserve these values and versions, recording the validation refinement. Do not infer DOM ownership from a field's name, a media component's `id` prop or `format: "anchor"` alone.

The pure extractor validates those attrs through the generated schema, returns their actual nonempty IDs and combines them with instance anchors for whole-tree uniqueness. Both backend and Website consume it. Replace the current handwritten `anchors` callbacks in heading/footnotes and the model's parallel authored-ID logic only in coordination with root/content. Keep renderer-generated private accessibility IDs separate and collision-safe; future authored ID producers must declare their paths before activation. Tests must prove cross-block heading/footnote/instance collisions and nested repeaters; check:blocks fails if source/mirrors drift.

Pure document contract source: `canonical-blocks-foundation/documentContracts.ts`, copied through the same approved portable/deployment closure. It exports `CanonicalDocumentRead`, `CanonicalDocumentDto`, `CanonicalInitializationDto`, `CanonicalWriteReceipt`, `CanonicalRevisionPage`, `CanonicalPageOptions`, closed parsers and the canonical content-digest function. Generated/portable imports are the only source for frontend DTO schemas; do not reproduce them in the preview codec.

## 3. Registered endpoint contracts

Namespace: `canonicalDocuments`. Names below become callable only after checkpoint A implementation, generated API refresh and root deployment. All are authenticated site-local handlers; no caller supplies a user, installation identity, resolver, enabled plugin list or runtime capability list.

### `get({ postId })`

Require an active current user, load the page/post and apply the shared ownership-aware `canEditContent`. Missing/non-page/non-post may return null after authentication; denied authority throws a structured error. Trashed documents refuse. A valid v2 row returns:

```ts
{
  contract: "canonical-document-v1",
  scope: { websiteKey: string, instanceKey: string },
  document: {
    id: PostId,
    type: "page" | "post",
    title: string,
    status: "draft", // checkpoint A writable/readable preview gate
    path: string | null,
    blocksVersion: 2,
    revision: number,
    digest: string,
    blocks: CanonicalBlockInstance[]
  },
  presentation: { packId: string, revision: string },
  policy: ResolverPolicy,
  data: DataEnvelope,
  resources: RenderResources
}
```

`ResolverPolicy` and `DataEnvelope` reuse existing foundation contracts. `RenderResources` reuses a pure extracted version of the existing closed `renderMediaSchema`, not raw media records. Only target-resolved media referenced by this tree is included. Missing/deleted resource handling follows its generated field contract; do not fabricate an image or zero-valued metadata. `content.page` continues to use public discovery/membership policy even for an editor: draft, password-protected, denied, deleted, nonpage and wrong-installation references yield `{page:null}`. No body or customer identity is projected from a referenced page.

The digest is lowercase SHA-256 over one exported stable serialization of `{blocksVersion:2,title,blocks}`. It is a consistency checksum, not an authorization claim. Parsed attrs and tree are the authoritative saved values. Presentation revision describes the authoritative active published pack configuration; the Website must match it or wait/refuse until matching presentation is installed. No draft settings or secrets are included.

To supply the source hash required by safe initialization without copying a legacy body into this DTO, an authorized legacy row returns a second closed discriminant:

```ts
{
  contract: "canonical-initialization-v1",
  scope: { websiteKey: string, instanceKey: string },
  document: {
    id: PostId, type: "page" | "post", title: string,
    revision: number, authoringDigest: string
  },
  initialization: {
    eligible: boolean,
    reason: null | "not-draft" | "existing-authored-content" | "unsupported-format"
  }
}
```

This is read metadata for the explicit temporary initialization action, not a migration result or Website preview. The digest covers the complete current authoring snapshot, including absence semantics, so old writers that do not increment blocksRevision cannot race initialization. Unknown versions remain explicit refusal. The frontend must branch on `contract`; it cannot treat a legacy result as an empty canonical tree.

### `initialize({ postId, expectedRevision, expectedAuthoringDigest, title, blocks })`

Create the first v2 envelope only on an exactly empty editable existing draft. Require both revision and full authoring digest to match in the same mutation. Empty means no legacy blocks/sections/structured authoring and content absent or exactly empty; do not interpret arbitrary JSON, flatten text or guess that a nonempty body is disposable. Preserve routing, ownership, document restrictions and unrelated configuration. Snapshot the original authoring state, validate the full candidate and referenced media, then assign version 2 and next revision. A legacy snapshot is not silently restorable over v2.

This operation is a temporary entry gate for the disposable draft acceptance. It is **not** the final migration workflow and cannot justify leaving authored drafts unsupported.

### `save({ postId, expectedRevision, title, blocks })`

Require current v2 draft, active editorial authority and exact safe-integer revision before comparing content. Reject stale revisions even if a retry's candidate equals the current document. An identical candidate at the current revision returns unchanged without a new snapshot. Otherwise run complete tree/runtime/reference validation, snapshot current authoring state and write only the allowed canonical authoring fields, clearing obsolete autosave state and advancing revision by one. Preserve status/owner/password/path/restrictions. Do not accept client-supplied next revision or a replacement document object.

All write operations return only:

```ts
{ postId: PostId, revision: number, digest: string, changed: boolean }
```

Native retains its draft until the authenticated `get` subscription produces the matching revision/digest and actual tree. A receipt does not carry a tree. Conflict leaves the local draft visible and offers an explicit reload/compare; no blind retry over newer content.

### `restore({ postId, revisionId, expectedRevision })`

Require revision.restore plus current document editorial authority. Require exact parent identity, current revision and v2 snapshot format; fully validate the restored tree and active resource attachments before writes. Snapshot current authoring, restore supported canonical authoring fields, and advance **current** revision. Never reuse the historical revision number or introduce ABA. Cross-version restore remains explicit refusal until the reviewed migration/restore adapter is implemented. Return the same write receipt.

### `pageRevisions({ postId, paginationOpts })`

Authorize the current document first. Use the existing parent revision index and one bounded page, with no `.collect()` retention work in this request. Return standard complete Convex pagination metadata and compact rows `{id,revisionNumber,createdAt,type,title,blocksVersion,restorable,reason}`. `blocksVersion` is integer or null for pre-version history; reason is null or `"legacy-format" | "unsupported-format"`. No full bodies, raw user records or per-row author enrichment. Restore validates the selected full row again; list eligibility does not authorize later mutation. Titles that exceed the closed DTO limit fail explicitly instead of truncating.

### `pageOptions({ postId, paginationOpts })`

Authorize the currently edited document. Accept one to twenty requested rows per page, enforce a server page scan budget of 256 rows/512 KiB, and retain all official cursor/split metadata. Query the page type index; use public discovery policy for candidates and return `{id,title,path,status:"publish"}` only. No unbounded title scan or invented full-text behavior is added. Empty intermediate pages are valid and keep continuation; visible options are not a total count. Measure full materialized post documents before any dependent policy/media read. A non-progress split or indivisible oversize document refuses explicitly.

Existing paginated media library handlers remain the media picker transport. The picker returns the generated field's canonical structured media value (including only permitted id/alt/focalPoint fields), not a raw backend record. `PickerResult {scope,value}` is checked against the current editor installation/document/revision generation; stale results cannot attach to another environment. Backend save still rechecks media lifecycle in the same transaction.

## 4. Read budgets and authority prerequisites

Do not claim complete query bounds from attrs validation or a final projection. Current foundation source ledger covers full fetched posts/media; current membership policyReads bounds one indexed rule/grant page, but permissions.ts still has unbounded membership grants in role/capability resolution and catches errors permissively. These are checkpoint A implementation prerequisites:

1. Reuse narrowly typed internal active/grace grant reads, each with one complete 256-row/512-KiB page. Preserve plan, role and expiry semantics; explicitly propagate budget refusals instead of swallowing them in catch-all fallback. Keep query/mutation pending-write tests. No generic context proxy or cross-call mutation cache.
2. Where an already resolved internal/system base role cannot be changed by customer grant roles (the existing pickHighestRole invariant), avoid grant scans without changing authorization results. Test this equivalence and inactive/Clerk boundaries; never elevate a Clerk customer into an internal role.
3. Account for raw user/role/plan/settings/installation/pack documents and policy pages in a request-local ledger at the actual known read helpers. Check remaining budget before the next dependent read and measure full materialized documents afterward. Deduplicate repeated page/media references within the request. An indivisible document can materialize before its size refusal; record that limit honestly.
4. Retain 80 nodes/eight levels/512-KiB tree, eight unique data jobs, 60-KiB per-result and 512-KiB total data envelope. Current full source budgets are 512-KiB post, 128-KiB media and 2-MiB aggregate source; the query must additionally bound and report authority/policy/pack work rather than hiding it outside that total. Pin the final combined query ledger only after the known read inventory and handler tests prove it. No public activation while an actual unbounded read remains.

Only `content.page` currently has the approved server adapter. Other resolver names or missing plugin/runtime implementations refuse before data work. Do not add a public resolve-arbitrary-tree endpoint. Save-time validation and public reference discovery are distinct: a syntactically valid same-site page reference can later become inaccessible, and its read must reactively become null.

## 5. Compatibility and atomic writer fences

Before any v2 row is allowed, fence every legacy body reader/converter and writer: block operations and AI; posts/pages create/update/HTTP/internal paths; title/body autosave; revisions; WordPress/import; duplicate; promotion export/apply/rollback; and generic authoring replacements. Metadata-only operations may continue only when they preserve the full envelope. Current legacy publication/scheduling must refuse v2 until the real public renderer is installed; no scheduled task can bypass that gate.

Root's active duplicate repair remains v1-only, with canEditContent, full authoringSnapshot, layout/lock preservation, fresh document revision, bounded metadata/lifecycle exclusions and document restriction handling. Later canonical duplicate must dispatch to the shared validated canonical service and preserve the entire v2 authoring snapshot; do not implement another partial field-copy routine.

Promotion must refuse source v2 **before** legacy pickData discards the discriminator, reject incoming legacy writes over current v2, and repeat the check at actual apply/rollback. Existing shared manifest checks already reject `children`; do not overstate that all nested v2 currently passes. Raw full snapshot restore bypasses app mutation helpers; its validation/completeness gate must cover v2 before such restore is allowed to replace it. Reverse-media-reference readiness also needs invalidation/backfill after raw restore.

Tests call actual registered handlers, including internal and late/scheduled paths, with a v2 row. Refusal must occur before any body/revision/scheduler write. Unknown format is not converted to empty blocks. A generic helper test alone is insufficient writer coverage.

## 6. Native-owned Website display boundary

The backend DTO contains no session token or viewer claim. Native owns the authenticated subscription and adds current operator/connection/frame generation to its transport wrapper. Use the content owner's existing injectable PreviewCodec, exact configured origins/window identity, per-mount MessageChannel and short display lease. A valid packet's backend binding must match scope/document/revision; its digest is recomputed by the shared pure contract. The viewer generation comes from native lifecycle, not authored attrs or backend API args.

Current proposed display lease is five seconds. Renew only while the actual authorized subscription, connection and reauthorization state are current; an interval alone does not prove server freshness. Immediately clear/close on known auth failure, scope/document/session/frame change or invalid packet, and expire after parent/offline loss. Do not claim instantaneous control-plane revocation across separate deployments. No bearer in messages/URLs/storage, no private SSR loader and no new preview JWT issuer. Top-level preview remains empty/refused.

Pass the validated saved tree, actual pack presentation, generated policy, target media resources and data envelope into the actual Website renderer/display store. Never install BlockDemo fixture resources or use a changed unsaved reference tree with data bound to an older saved tree. Unsaved authorized preview is required later and must obtain a newly validated candidate-bound response.

## 7. Checkpoint evidence and required final work

Checkpoint A completion requires deterministic root/staged/deployed/portable contract drift checks; backend and consumer types; actual-handler authorization/CAS/restore/writer-fence tests; pending mutation grant reads; budget/split refusal; generated anchor collision tests; and no activated UI route. Checkpoint B connects native editor and real Website preview locally. Root alone performs checkpoint C on one disposable Aster staging draft, including rich-text marks/children/IDs/anchors/reference readback, save/reopen/restore, authority loss, responsive keyboard behavior and no public draft leak.

The following are **required end-state work, not deferred-away scope**:

- Lossless migration of existing authored drafts and all legacy content models, including original preservation, exact source CAS and explicit unresolved treatment failures.
- Canonical duplication, revision restore across supported migrations, export/import/promotion and rollback without envelope loss or revision ABA.
- Canonical publication, scheduling and ordinary Website public rendering under the existing content/membership policy.
- Actually applied visibility/lock/style semantics; full editor operations and unsaved authorized preview.
- All 136 specified blocks, real backing resolvers/actions, complete pack treatments and authored-content acceptance.
- Scalable maintained media reverse references with complete writer/backfill/restore readiness, not permanent reliance on bounded deletion refusal.

Empty-draft initialization, default-only policy and v2 publication refusal are temporary safety gates. They cannot be called the finished content system.

## First implementation checkpoint: pure tree foundation

Implemented outside the active deployed Convex graph: generator-owned `instance-runtime.mjs` and declaration; generated `instances.ts` closed full-tree validator; name-correlated `CanonicalBlockInstance`/`CanonicalTree` types; explicit `domId` field metadata and generated heading/footnote anchor descriptors. The existing staged data planner now consumes this validator instead of independently accepting unvalidated layout/style/anchors. Root/staged outputs and the portable Website closure are deterministic and current; the latter now contains eleven exact pure source files. All 136 specs and current 79 renderer paths are represented.

Three actual-planner tests first failed because invalid layout, unsupported named style and duplicate authored DOM anchors were accepted. Eight expanded tree tests now pass with 269 assertions, including all discovered examples, marked rich text, nesting, unsupported visibility/locks, per-page IDs, generated nested paths and bounds. The combined generator/planner regression run passed 18 tests/148 assertions; the isolated foundation TypeScript check passed (empty `/tmp/canonical-instance-foundation-types.log`, session32639 exit0). All three generation drift checks and diff whitespace checks passed.

Exact consumer exports are `blocks/.generated/types.ts` (`CanonicalBlockInstance`, `CanonicalTree`), `blocks/.generated/instances.ts` (`validateCanonicalTree`, `canonicalTreeSchema`, `collectCanonicalAnchors`, `createCanonicalLayoutSchema`) and `metadata.ts` (`anchorDescriptors`). Backend staged and Website portable mirrors expose identical artifacts. Document DTO exports/API handlers, deployed packaging, menu vocabulary adoption, bounded permissions, writer fences and storage activation are still pending; this pure slice is not checkpoint A completion. Root approved content-owner adoption of shared anchors/layout while preserving unrelated Section/default CSS behavior. Source is held during root's follow-up media/membership scan-fix deployment.

## Second implementation checkpoint: authority, write fence and display DTO

Bounded permission grant resolution is implemented in `helpers/membershipAuthority.ts` and consumed by the existing permission helpers. Active and grace statuses each reuse the real complete indexed policy query (256 rows/512 KiB); failures propagate. The role/plan reader deduplicates only within one resolution and refuses before read 129, after a full document above128KiB, or after the 1MiB dependent-document total. Internal/system base roles return early only where customer grant roles cannot replace them under the existing role ordering. No Clerk role eligibility or management capability intersection changed. The actual registered media handler refuses a grant overflow before reading media. Real convex-test nested queries see a pending grace grant and its subsequent revocation after an outer pagination read. Focused helpers/membership/media/roles tests passed370/1337, and the permission-only backend TypeScript snapshot passed before the subsequent media reverse-index integration. These are per-helper bounds, **not a completed request-wide authority/policy/settings ledger**.

`helpers/authoringVersionFence.ts` now provides the low-level format guard consumed by the existing media write wrappers. It refuses legacy body/title/autosave replacements of v2, unknown envelopes, downgrade, and checkpoint publication (publish/future/private). Metadata-only patches and ordinary v1 writes remain available. A canonical service can mint an internal one-use permit only after its own authority/CAS/tree validation; that permit binds the exact candidate object and encoded content, target/operation and complete prior authoring state. A serialized object is not a permit. This is a source-level integration guard, not a replacement for authorization. Five pure guard tests passed40assertions; complete actual-handler writer coverage and canonical service issuance remain required.

The pure `documentContracts.ts` and `renderResources.ts` now pin the real display contract. `parseCanonicalDocumentRead` and `canonicalDocumentReadSchema` validate the full tree, recompute its SHA256 using the existing browser-safe site-contract implementation, verify resolver bindings/scope, and require exactly the generated media references. Extra credentials/raw metadata, unexpected resources, missing resources and stale data refuse. The parser is synchronous. Limits are100distinct referenced media,512KiB resolved resources,1,600KiB entire display transport, and512characters in projected titles; overflow is explicit. The initialized-vs-legacy discriminant remains closed and internally consistent. Pagination schemas retain empty continuation pages and the official nullable split metadata. Five DTO tests passed26assertions; the pure TypeScript closure passed independently of the active backend graph.

`portable-data.mjs` now emits14 exact pure files including document/media contracts and a byte-exact copy of the existing `site-contract/src/fingerprints.ts`. `backend-foundation.mjs` checks that shared source, and `deployed-foundation.mjs` can emit the same isolated closure inside `convex/canonicalDocuments/foundation`. Its test imports the resulting directory with no repository-relative dependency and refuses changed or unmanaged files. The deployed copy has not yet been emitted in the live Convex source graph. Portable+tree tests passed9/275; the deployed packaging test passed1/6. Website ownership is adopting the shared media/captions bases without changing their existing validation vocabulary.

Still unimplemented: registered get/initialize/save/restore/pageOptions/pageRevisions, storage discriminator/schema union, service authority/aggregate ledgers, source/read writer fences outside the generic wrapper, revision retention behavior and route/editor activation. No v2 documents have been written or deployed by this work. Broad backend TypeScript currently awaits the other owner's reverse-index integration baseline; no claim that the combined tree is deployment-ready.

## Registered lifecycle source checkpoint (2026-09-05)

The six agreed exports now exist at `api.canonicalDocuments.*`; their implementation and remaining acceptance boundaries are documented in `canonical-checkpoint-a-outcome.md`. `get` adds optional bounded `refreshKey` (1–64 alphanumeric/underscore/hyphen characters) for fresh explicit reads when a ConvexReactClient subscription could otherwise return its local cache. It has no authority/scope meaning and does not change the DTO. Native preview/reopen must validate the resulting authoritative snapshot rather than treating a write receipt as content.

The request-local raw-read ledger is implemented and threaded through the actual service, known authority/policy/appearance callgraph and guarded media writes. This supersedes the earlier statement that request-wide ledger plumbing was absent. The deployed closure is now emitted with deterministic Convex-safe underscore filenames/imports; it is not byte-identical at renamed import strings. The structural storage validator is generated from the same node schema. No live canonical activation is claimed here; migration, public publication, canonical duplicate/promotion and full policy semantics remain required.
