# Canonical block audience visibility — September 21

Everyone, Signed-in visitors and Signed-out visitors now work through the shared instance contract, native editor and public projection. The original release audit remains eight accepted/sixteen open; full Library, template and motion acceptance remains open.

## Implementation and compatibility

The existing closed visibility enum now permits its supported values. Blocks that do not declare visibility support still reject it. Native controls use generated choices, normal immutable drafts, Undo/Redo and revision-guarded Save; pending/conflicted states, lost authority and edit locks disable changes. No content schema version bump or silent legacy conversion is introduced. Existing legacy inactive-setting review remains required.

Public projection resolves an active user in the current site database; an unmapped JWT subject or inactive account does not grant signed-in visibility. Parent denial removes the complete subtree before dynamic media/data projection. Reusable placements and source occurrences use the same policy. Search uses the shared projection against current source content. Direct interactive-host endpoints retain their own current-source ancestor checks. Authorized editing previews retain every audience while membership restrictions remain enforced; this option is internal and is not exposed to public query callers.

The real native preview exposed a missing display boundary: approved blocks retained authoring visibility metadata, and the renderer deliberately rejected it with `visibility requires an explicit instance-policy adapter`. Connection and decode succeeded; rendering failed. The shared public-tree projection now strips visibility after the server selects visible content, just as it strips edit locks. The renderer still refuses unprojected visibility. The authoring tree preserves its saved rules. A renderer regression reproduces the failure before the fix and passes afterward for all three audience choices.

## Verification

- Full registered backend suite: 3,301 tests, 18,196 assertions, zero failures across 298 files. Covers anonymous/member/inactive/unmapped identities, nested parents, hidden resources, reusable occurrences, stale search indexes and retained interactive IDs. The previous lead-magnet test expected all conditional visibility to be unsupported; it now checks authorized signed-in and anonymous signed-out positives plus reciprocal denials.
- Renderer suite: 293 tests/5,123 assertions pass, including the display-boundary regression. Twelve preview/public/reusable contract cases pass with 85 assertions.
- Canonical editor suite: 58 tests/1,104 assertions pass. Visibility coverage includes immutable changes, generated closed choices, Undo/Redo, explicit save, lock and authority enforcement.
- Root block suite at the initial implementation checkpoint: 142 tests/17,512 assertions pass. Final source generation freshness, block validation and distributed kit parity pass. Admin/Website type checks and builds, correctly scoped backend TypeScript, strict staging deployment, focused lint and whitespace pass. Existing bundle-size warnings remain.

## Actual native and public acceptance

The disposable source database at4860 was backed up with storage and deployed using its preserved 1,593-file generated-plugin checkpoint. The initial normal consumer-index rebuild completed; the final deployment retained ready status with214 documents. Target4870, cloud sites and DNS were not changed.

Owned Electron72433 converted one three-heading fixture and saved signed-in/signed-out choices. Reload retained the saved value. After the display-boundary repair and a matching editor reload, the actual Website iframe rendered all three audience headings and confirmed live preview. Native publication exposed the same fixture through the production-built Website. A newly created development Clerk Subscriber completed real password/test-code sign-in. Its active Clerk-backed local profile and customer role were checked; authoring access was denied. The member view contains member/everyone headings, while anonymous contains everyone/guest headings. Hidden text is absent from the corresponding server DTO, not merely hidden with CSS. Both identities were checked at1440/390px with no horizontal overflow or captured public page errors; native and public screenshots were saved, with native/guest mobile inspected. This is a Core fixture acceptance, not all-pack design approval.

Customer logout was confirmed against the real Clerk session. Native withdrawal and original-editor recovery restored all original authored fields; only expected blocksRevision/updatedAt and retained publishedAt differ. Native operator logout was visibly confirmed. The test user is inactive locally, its retained token cannot read its profile, and its owned Clerk account was deleted with404 readback. All42 pre-existing pages and complete appearance identity/values match baseline. The fixture is trashed, the API session is logged out and the owned profile/processes are removed. Original Electron39198, renderer69634, BlockDemo8172 and SOCKS68390 remain running.

## Diagnostic limitations and tracking

Two earlier bare backend `tsc --noEmit` invocations picked up an ancestor project configuration and exhausted memory. The correctly scoped `-p convex/tsconfig.json` check and deployed strict check pass; no type guard was weakened. An initial regression used an obsolete heading version and was corrected before establishing the actual failing renderer case. During deployment an automation locator waited for Reconnect after the editor had moved to an unavailable-document state and its tool kernel timed out. The existing owned Electron process was positively located and reattached, then reloaded with matching contracts; no application restart or uncertain content write was replayed. Selector mismatches were resolved by inspecting actual UI roles.

MagicTables receives one Notes-only update on core/heading after live base/schema reads, a zero-create/one-update dry run, a fresh preapply snapshot and full137-row readback. Status and all other cells remain unchanged. Artifacts: `output/block-visibility-20260921/`, including test/build logs, deployment manifests, native/public images, identity/DTO acceptance, restoration/cleanup and tracker receipts. No push.
