# Original fleet lifecycle migration — October 7

E109's local migration API now supports an explicit upgrade that retains the reviewed publication state. This closes the draft-only implementation gap for the original eight published and three auto-draft records. It does not close installed migration or native/public acceptance; no original site was deployed or mutated in this step.

`prepareMigration` and `migrate` accept the same exact `preserveStatus` value: publish, private, future or auto-draft. Review exposes `preservesStatus`. Ordinary callers retain the existing draft-only workflow. Trash preservation remains separate. The complete reviewed row is bound by the source digest, so changed ownership, routes, confidentiality, scheduling, timestamps or authoring invalidate the review.

The server checks edit authority and, for publication states, publishing authority at both review and commit. It retains status, publication/schedule timestamps, ownership, routes and updatedAt; archives original authoring and distinct autosaves; and runs the existing resource, media, action and publication checks. No withdrawal, restoration, rescheduling or republication is issued. Auto-draft's draft projection is display-only. Its one-time legacy-to-canonical write permit cannot insert/replace an auto-draft, change publication fields, convert an already canonical row, or be forged/replayed. Historical import does not gain this override.

## Verified evidence

Logs under `output/original-fleet-20261007/`:

- Five new registered-function cases failed first because preserveStatus was unsupported (`lifecycle-red.log`).
- The auto-draft case then exposed the independent low-level write fence. A focused failing permit test was added before repairing that boundary (`lifecycle-fence-red.log`).
- Document and fence suites: 180 pass, zero failures, 1,833 assertions (`lifecycle-documents-2.log`). Four lifecycle states, exact history, no publication events, public visibility, stale metadata, revoked authority, conflicting intent and replay refusal are covered.
- Canonical family suite: 435 pass, zero failures (`lifecycle-canonical.log`).
- Full convex runtime suite: 3,516 pass, zero failures, 19,825 assertions across 310 files (`lifecycle-full-backend.log`). Foundation/tooling: 192 pass, zero failures, 5,973 assertions across 43 files (`lifecycle-foundation-tools.log`). These are the checked scopes; prior totals are not substituted.
- Strict backend, Admin and Website types pass. Generated contract synchronization and block checks pass. Reviewed media writer coverage passes for 1,488 writes, 30 owner tables; reusable consumer coverage was regenerated for the changed service/fence. Block-kit documentation and its distributed reference agree; three kit tests pass.

The first typecheck invocation used a nonexistent backend-root tsconfig and was corrected to convex/tsconfig.json. The first Admin typecheck invocation used an absent apps/admin directory and was corrected to apps/web. Neither was a source failure; successful corrected checks are recorded separately.

## Installed baseline and next step

Exact installed compiled sources were captured privately for all four original backends. Alpha/gamma have byte-identical sets of 1,739 modules. Beta/delta each have 996 modules but differ; they must not share an assumed source baseline. Captured source maps omit original TypeScript content. Public receipts contain only paths and hashes.

The historical site-autosave checkpoint fails its saved manifest on 118 missing/changed files. It remains untouched and is not accepted as a deployment baseline. The isolated debug-bundle comparison completed without push: 1,771 candidate modules versus 1,739 installed, with only 342 byte-identical module sources. That copy is rejected as an exact baseline; bundled dependency changes can propagate broadly, so the difference count is not a source-file defect count. Receipts: baseline-probe.json and baseline-probe.log. No historical receipt is treated as current proof.

Next: establish a matching transition candidate that retains old public reads and compatible storage while the original corpus is upgraded. Check exact original reference/policy behavior, archive/readback and all 120 stored files, then matching native/Website behavior and final contraction. Rebuild or reconcile consumer indexes for the new source version. Do not deploy current contracted storage over legacy rows, infer source parity from matching function names, or transfer site credentials between environments.
