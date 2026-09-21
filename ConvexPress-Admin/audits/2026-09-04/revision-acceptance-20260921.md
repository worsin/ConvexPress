# September 21 revision recovery and update listeners

B07 remains open. Native full-tree recovery is now proven on the current disposable staging backend, but public canonical body search and the recovered structured-article editing surface still need work. Original audit count remains five accepted and nineteen open.

## Native and rendered evidence

Created three owned staging fixtures. A published canonical page retained its title while its nested marked text, image ID/alt/caption, width/tone/spacing, anchor and page layout/header/footer settings changed. Actual Electron history restored the prior snapshot. Exact stored tree and authoring-field comparison passed; current publication, visibility, author and newer URL stayed intact. The revision advanced from4 to5. Anonymous desktop/mobile rendering showed the original bold text, original loaded ceramics asset and compact muted layout; the mobile screenshot was inspected. Native restoration of the pre-restore safety snapshot returned the edited tree and layout at revision6.

Original rich-text JSON and structured-article fixtures were migrated and recovered through Electron's original-editor confirmation. Nineteen authoring fields matched their original values exactly, including rich text, hero/topics/summary/sources, image, authoring brief and absent fields. Both canonical safety versions were then restored through Electron and matched their saved trees at revision3. Real embedded Website previews rendered the marked rich text/link and complete structured article, including its image, topics, contents and sources. A stale revision and a revision belonging to another document were refused with no document change.

This proves source recovery and canonical safety undo. It does not prove satisfactory editing of the recovered structured article: the original editor exposed only its fallback content while hero/topics remained stored. That mismatch is a concrete remaining B07/legacy-editor requirement. Unsupported raw HTML migration was refused; the rich-text fixture was corrected to the actual supported JSON document format. No HTML adapter acceptance is claimed.

The first public page captures occurred before chrome overrides settled. A later hydrated mobile check verified both hidden header and footer and no overflow; no header/footer defect is inferred from those early captures.

## Product fix and staging configuration

Canonical saves, revision restores, original-editor recovery and document settings previously omitted normal post/page update events. They now notify the standard incremental listeners in the write transaction. No-ops and refused writes remain silent. Event payloads carry document identity/title and changed field names, with old/new slug metadata for the existing routing listener; bodies and passwords are not copied. Descendant route changes also notify their listeners.

The new registered-handler regression failed before repair and passes for both page and post lifecycles, including no-op, stale revision, original recovery, settings and slug metadata. Generated reusable-consumer coverage was refreshed after the guarded writer changed.

The first live check revealed zero registered listeners in Promotion Lab staging. An authorized read including inactive rows confirmed the inventory was empty. The existing missing-only `bootstrap/registerListeners:ensureRequired` installed155 defaults, with zero reactivations/deactivations. This intentional staging configuration repair is retained. It does not replay historical events. The checked page.updated handlers perform local search/sitemap/routing/audit work.

After repair, a fresh title update became anonymously searchable in3778ms. Restoring its saved original revision removed the changed title in571ms and retained the original searchable title (32ms subsequent read). No manual reindex was used to make this test pass.

Canonical body search remains absent: the indexer reads legacy `post.content`, while the public source reader intentionally excludes canonical bodies. Safely indexing visitor-visible authored text must respect block visibility, membership, composed/synced content and current source checks. Do not expose raw block JSON or remove these guards just to satisfy a body match.

## Validation and deployment

Final full backend suite:3443 passed,0 failed,23802 assertions across332 files. Backend TypeScript passes. The initial broad run had one stale coverage failure; regeneration and the final full run resolved it. Focused new test originally failed on a missing update event. A mistakenly non-relative Bun test path also scanned old checkpoint copies; those runs are not acceptance evidence. `git diff --check` passes.

Biome is not green: the two large existing files have309 warnings, two infos and one pre-existing `noConstantCondition` error at the older product-category pagination test's `while(true)`. Confirmed the same line in the parent commit. This is recorded rather than claiming lint success.

Staging deployment preserved its generated plugin source graph. Final immutable checkpoint: `ConvexPress-Admin/output/production-checkpoints/revision-events-r2-20260921`. Across1401 recorded files, only canonicalDocuments/service.ts and syncedBlocks/consumerIndexVersion.generated.ts differ from the preceding staging source. Final deployment preflight and strict deployed typecheck pass; storage-inclusive backups remain private. An earlier deployment preceded coverage regeneration and is superseded by this final checkpoint. No production or cloud deployment occurred.

Cleanup trashed the three owned documents, verified exact preservation of42 original pages and2 posts, and compared template/identity and all four original media records. Article creation had attached the reused ceramics asset to its fixture; ordinary media update restored the original unattached state. Only that media update timestamp legitimately differs. API session logged out. Native/process cleanup is recorded separately. Original user processes are preserved.

Evidence: `output/revision-acceptance-20260921/` includes original/changed/restored public captures, native confirmation/preview captures, restored and safety readbacks, legacy-acceptance.json, safety-acceptance.json, live-events.json, listeners-before/after.json, listeners-repair.json, deployment-source-r2.json, deployment-r2.json, backup-r2.json, backend-suite-final.log, backend-types-final.log, writer-check.log, lint-full.log and cleanup.json.

Next: implement permission-aware canonical body indexing and current-source search matching, then repair the recovered structured-article editor and finish its rendered recovery acceptance. Keep B07 open until those paths are proven. Resume deployments from the final r2 checkpoint, preserving the generated plugin; the older temporary SDK source tree is no longer the latest deployed source.
