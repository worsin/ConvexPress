# Migration planner repair and retained-content inventory — September 29

E62's planner failure is repaired. Full tooling now passes **185tests /18,117assertions**. This does not complete installed content migration or legacy retirement (E07/Task4).

## E62: historical fields contaminated the current spec

`stagedMigrationPlan` loaded an installed canonical spec, then re-extracted historical fields into it while retaining newer nested authoring-action rules. Feature Grid's `items.*.link` and Team Grid's `members.*.links.*` no longer described those historical field trees. Both the full tooling suite and `check:blocks-migration` aborted before producing the complete report.

The extractor now retains a separate historical proposal. Staging analyzes that proposal; installed canonical specs keep their exact fields, rules, versions, resolver metadata and authored examples. The write modes skip installed specs and use exclusive creation for missing specs. No current action rule was dropped, and no installed spec or content was rewritten in this batch.

A new regression failed before the change and now verifies both affected installed specs remain exact and untouched after repeatable planning. The existing complete54-definition migration/boundary/type check passes unchanged. Focused migration checks pass4tests/1,607assertions; the full tooling suite passes185/0. Scoped lint and diff checks pass.

The actual `check:blocks-migration` command now prints a complete report:54existing/54representable schemas,36Website-schema differences,7default differences,44families awaiting rendered migration acceptance and no unrepresentable schema entries. It **still exits1**, intentionally reporting unfinished acceptance. This is a complete planning report, not a green migration acceptance gate. The schema report is distinct from actual stored-document convertibility below.

## Complete scans of the two inspected databases

Each table was paginated until its authoritative `isDone` result, with duplicate-ID and cursor-progress checks. No fixed-limit page was mistaken for a complete corpus. Raw rows and generated candidates are private0600files; public evidence contains counts, IDs, hashes and classifications. The complete posts table was reread unchanged after inspection. All owned inventory API sessions were revoked.

| Database | Documents, including trash | Canonical / legacy | Retained revisions, canonical / legacy | Legacy reusable records | Synced sources / revisions |
|---|---:|---:|---:|---:|---:|
| Source4860 |116|74/42|266/119|0|9/28|
| Target4870 |29|27/2|65/21|0|4/22|

The source count includes the explicitly marked active RSVP fixture. Excluding trash, source has7legacy documents (5published pages and2published posts); target has2legacy drafts (1page and1post). These counts do not contradict prior preservation of42original source pages: normal page listings excluded trash and posts, while this scan reads the full retained table. Historical revisions are classified by their stored blocksVersion and remain untouched.

The registered operator `prepareMigration` query succeeds for both target legacy drafts, proposing1and6blocks. Source legacy documents are published or trashed; no status was changed to force that draft-only query to accept them.

## Exact converter coverage and explicit refusals

The current production foundation converters were applied offline to every legacy document in the retained snapshots, selecting the same visible-source precedence as the service. Source38of42convert and4refuse; target2of2convert. Input objects and the private snapshot bytes remain exact. This is pure conversion evidence, not installed migration, reference resolution or rendered acceptance.

Three source documents contain raw non-JSON text that the document converter deliberately refuses. Two are published: `g186z2srz764zhj0am1jsqfx598edpgs` and `g1826qaax1gz8w9gnfh40fcb398ecq90`; one is trash: `g18f1f0zky10b3cpy7cyze0m258evdz9`. A fourth trashed document, `g18enhe1p2ts5gvantmrzc2t7d8evk4j`, requires a multi-block list-item adapter at `content[2].content[0].content`. None was skipped from the report or normalized into a partial result.

Source inspection shows the legacy post surface parses TipTap content and displays an empty-content fallback when that parsing fails. Therefore raw-text migration must explicitly review stored intent and visible behavior; blindly turning previously unrendered text into published prose would not prove visual preservation. The mixed list item likewise needs a lossless target representation, retaining its original snapshot.

Evidence: `output/migration-corpus-20260929/inventory.json`, `reusable-inventory.json`, `conversion-review.json`; tooling logs under `output/block-evidence-20260929/` (`tooling-tests-migration-green.log`, `migration-check-after-separation.log`). The original E62 failure is retained in `migration-check-red.log`.

## Remaining boundary

These scans are complete for the named tables in source4860 and target4870 only. Repository/demo seed corpora, reference ownership/remapping, inactive alternate source fields, historical restore coverage, canonical synced-content workflows, owned native conversion/recovery/render comparisons, installed-site migration receipts and retirement of active legacy editor/renderer/schema paths remain Task4 work. No overall corpus, migration or delivery-completion claim follows. RSVP's human CAPTCHA fixture remains active and separately journaled; tracker remains117Verified/20In progress.
