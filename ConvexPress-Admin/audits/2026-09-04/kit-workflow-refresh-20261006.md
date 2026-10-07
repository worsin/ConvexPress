# Kit workflow refresh — October 6

Task 7 documentation progress. The full delivery goal remains active, with
133 Verified and four In progress block rows. No runtime, deployment, site-data
or tracker mutation in this batch.

## Corrected instructions

The extension README and current generator already implement a complete backend,
Admin, Website and Dashboard starter. WORKFLOW.md and all three discoverable
extension skills still prescribed the older two-part manual layout, camelCase
IDs, deferred public integration and stale API types until deployment. The audit
skill claimed read-only operation while instructing write-mode codegen.

Replaced those obsolete paths with the actual generator/adaptation/verification
workflow. Public slug, underscore backend module and camelCase settings key are
distinguished. Official generator output is explicit; scanner support for local
extensions is not misrepresented as a generator flag. Public fields must reach
DTOs, native editor and intended public/Dashboard consumers. Public RSVP authority
is distinguished from operator capability checks. Read-only audits preserve
potentially stale generated output as evidence.

Updated all four copies of each extension skill and both extension-kit README /
WORKFLOW copies. Added block-kit/AUTHORING.md with the minimal native page,
publication, template, Customize and recovery workflow, and linked it from the
three kit entry points. Promotion now uses dependency-ordered sync:blocks:all.
Removed stale blanket claims that legacy retirement, four-pack Customizer and
appearance promotion had no acceptance; remaining HTTPS/provider/final gates
remain explicit. The existing block-kit synchronizer distributed all changed
block-kit files.

## Verification

- Reference-skill baseline failed on the old instructions before edits. Separate
  revised build, add-public-field and read-only audit scenarios each passed.
- Build scenario ran the real read-only community-events dry run: 52 planned
  paths, including two existing catalog inputs; all 50 new paths remained absent.
- Add-field scenario traced the actual Events model/publicEvent projection,
  native editor state/save, Website DTO/API and detail surface. Dashboard reuses
  the listing surface, so changing detail alone would not satisfy that consumer;
  revised instructions explicitly require this trace.
- Audit scenario preserved source and distinguished customer RSVP authority from
  operator manage_options. No write-mode generation, build or deployment ran.
- Existing scaffold suite: eight tests, 156 assertions, zero failures. Its own
  temporary test outputs were removed by the suite.
- Block-kit distribution: eight canonical skills, 78 distributed files, zero
  stale. All 12 extension skill copies and both changed extension-kit documents
  are byte-equal to their respective sources. Delivery-status parity remains
  137 rows, 133/4; git diff whitespace check passes.

Evidence: output/kit-workflow-refresh-20261006/verification.json and
scaffold-tests.log. This is source/documentation verification, not a new live
extension or native UI acceptance run. No extra build/deployment was needed for
these prose-only changes.

## Cleanup accounting and next gate

The template SDK trial removed its paired scaffold/canonical copies after
retaining snapshots. The block SDK and generated extension trials archived and
removed their owned source and stopped their trial runtimes. Their detailed
cleanup receipts remain in template-sdk-trial-20261006.md,
block-sdk-workflows-20261006.md and extension-installed-20261006.md.

The Aster mixed native draft is a separate retained fixture, not a removed
scaffold. native-field-reusable-20261006.md and mixed-composition-20261006.md
identify draft k9825w4682xavx7nbj8wa36xs98fsgtk, pinned source
rh88hrt480zfjhg205cw0c1nsn8fr6g4 and composed/acceptance-garden-feature. Their
native authoring/recovery evidence is reusable, but all-field/live-Events public
updates and pack switching remain an explicit Task 7 gate. Verify current live
identity/consumers, finish that check, then clean only owned fixtures through the
normal contracts. Do not delete content from historical IDs alone.

E17 now names this distinction. The combined docs/fixture-cleanup plan checkbox
stays open until that retained fixture is accounted for. Actual AI generation
still needs the already-requested authorized provider configuration. No waiting
for a new Claude audit; audit 56 remains the latest reviewed feedback.
