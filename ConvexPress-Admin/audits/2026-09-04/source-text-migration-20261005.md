# Installed source text migration — 2026-10-05

Both remaining active legacy source posts were deliberately imported as editable canonical paragraphs and republished. All active source and target authoring is now canonical; Task4/E07 is still open for trash/history/reference reconciliation and live legacy retirement.

## Decision and result

The two disposable archive-acceptance posts retained the exact sentence “A short acceptance story for the isolated test website.” Their empty legacy blocks renderer instead displayed “This post has no content yet.” The deliberate migration decision was to expose that retained sentence as the post body, rather than silently preserve an empty public body. Same-text native review/acknowledgement/recovery evidence from `plain-text-import-20261005` was reused; actual original records were checked again before writes and after migration.

| Original | ID | Final revision | Original recovery snapshot |
|---|---|---|---|
| Archive acceptance: a morning worth keeping | g186z2srz764zhj0am1jsqfx598edpgs | 2 | hd80wnzdvmecd10ptdm7r2rhhn8fpc8k |
| Archive acceptance: notes from the trail | g1826qaax1gz8w9gnfh40fcb398ecq90 | 2 | hd846x4qm1zf6neb5yf5mjmryn8fq8vm |

Each record used explicit draft withdrawal, fresh preparation, revision/source/candidate/presentation guards, `acknowledgeTextImport: true`, canonical readback and republication. All six content writes have acknowledged journal receipts. The existing draft-only migration contract was retained; no backend deployment or product-code change was made.

## Verification

- Source116records:81canonical/35legacy, **zero active legacy**. All35legacy records remain trash. Source399revisions:395prior exact plus2original-authoring snapshots and2canonical publication snapshots.
- All114unrelated source records exact. Both migrated records preserve every non-authoring field, including slugs, original publication dates, ownership, visibility and excerpts. Target29records/88revisions and appearance exact.
- Public before/after1440px and390px: the only visible text change is replacing the empty-body placeholder with the reviewed literal sentence. Headings, links and URLs exact; no overflow or runtime errors.
- Actual native Electron reopened both originals as saved, published canonical documents. Actual Website previews at532px desktop/390px mobile display the exact paragraph without overflow/errors. Public phone and native phone captures visually inspected.
- Publication-author/subscriber templates were temporarily disabled through the normal API. Both exact `post.published` events and every listener finished before restoring their original enabled values. Final queue exact; no additional mail. Template content/settings exact; only the two normal audit timestamps advanced. The separately muted RSVP settings-alert template stayed unchanged.
- Storage-inclusive backup5,157,885bytes, SHA256 `b1470b48547b624627f8445a39922d18201732087d07c9921ac475b8a2633dc7`; private source/credentials remain outside the repository.

Receipts under `output/source-text-migration-20261005/`: `prepared.json`, `backup.json`, `migration-journal.json`, `publication-events.json`, `installed-proof.json`, `render-comparison.json`, `native-originals.json`, `cleanup.json`. Journals must not be replayed. Content-only batch verified through installed/runtime/preservation checks; no unrelated broad suite run.

Harness corrections: public mobile sign-in locator needed banner scope; event payloads required JSON decoding; semantic comparison explicitly accounts for the old empty-body placeholder. These did not cause additional content writes or product changes.

## Next boundary

The35retained trash records comprise10previously published,2private and23draft records. Current posts/pages restore mutations reinstate previousStatus; restoring the entire corpus as-is could republish legacy content. Next work must preserve trash/publication intent and exact source/history while making restored content enter a reviewed canonical workflow. Do not claim full migration or remove historical recovery fields yet. Full delivery remains active/incomplete;117Verified/20In progress unchanged. No push.

Cleanup confirmed: native control-plane sign-out verified at the actual login heading; API session revoked; owned Electron48022 and Website47884/48008 exited; owned profile removed. No copies were needed in this batch. Actual migrated posts and original snapshots retained. Owner processes and separately pending RSVP fixtures untouched.

Checkpoint: two installed posts advanced; no current blocker for the next trash-restore slice. Overall delivery estimate remains low-confidence/unbounded until remaining provider, example-site and SDK workflows are measured. The next bounded unit is source-backed restore-path design and a failing preservation/publication regression, followed by its scoped repair.
