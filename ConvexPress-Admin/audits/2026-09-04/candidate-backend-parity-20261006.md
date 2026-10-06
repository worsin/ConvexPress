# Candidate backend parity and target connection metadata — October 6

The target's development Clerk connection metadata now agrees with its working credentials. Both environment-specific deployment candidates compile against the current backend source; the source candidate preserves its installed Community Events extension. Both candidates are now deployed, with shared contract parity and live canonical publication readback verified.

## Connection repair

Fresh operator reads showed the source ready and the target connected through environment credentials but missing its stored issuer, mode and capabilities. The existing deployment handoff query intentionally returns no values when the stored issuer is absent, so it cannot verify an environment-only connection. Read the target's actual environment through the authorized environment query instead; the secret/public key matched the source development connection and the deployment issuer matched the source issuer.

Used the existing capability-gated `settings/mutations:updateSection` workflow to reconcile the target's connection metadata, then the normal `syncCapabilities` and `verify` actions for fresh provider reads. Preserved the existing keyless/unclaimed development identity and claim metadata. Credentials stayed in their original storage, with no provider configuration, JWT template, origins or webhook changes. Source connection state remained exact. Both environments now report loginReady, recorded matching issuer and capabilities. This is development readiness; the app is still unclaimed and has no webhook secret.

All 43 original source pages, 28 original target pages and checked appearance/general/reading settings stayed exact. Both temporary operator sessions were revoked and refresh returned 401. The prior connection record is retained privately; no claim URL, secret or session appears in this report or public receipts.

## Candidate assembly and verification

Each candidate starts from its own sealed installed snapshot. The current base backend, canonical foundations, site contract, blocks catalog and config files are overlaid; extension indexes and media/consumer inventories are generated from the resulting installed tree. All 22 source Community Events extension files remain byte-identical. The target does not acquire that extension. Each snapshot has its own dependency links; the target's missing sanitizer dependency links were resolved to the already installed pinned packages.

Strict standalone TypeScript and strict Convex deployment dry runs passed for both candidates. Neither dry run deletes indexes. The target adds the current cart-user/status, search-reindex-key and two operator-handoff indexes.

The initial broad snapshot test run was not accepted: 3,691 passed, 29 failed, one error. Repository-layout tests require the actual repository rather than an isolated deployment tree. Fourteen assertions also failed in the real workspace: retired generic create/update and preview exports, REST reads lacking their now-required API-key authority, the canonical page route and the current menu default. Corrected those tests against current contracts; no production auth or authoring behavior was weakened. Missing-key REST calls assert FORBIDDEN; registered canonical/API round-trip and access-policy coverage remains in the canonical document suite. The focused four-file run passed 78 tests/690 assertions. The full current workspace backend suite passed **3,704 tests, zero failures, 25,684 assertions** across 353 files. The installed Community Events tests also passed in the initial snapshot run.

Harness errors are excluded from product evidence: a first metadata comparison used the empty deployment handoff response; an invalid `menus` settings section was removed in favor of the real menu query used by deployment baselines; workspace Bun filter invocations scanned deployment outputs and hit EMFILE, corrected by explicit relative file paths from the backend directory. A wrong-directory edit attempt made no file changes. None of those failed runs is represented as green evidence.

## Deployment and live acceptance

Full data and file-storage exports were captured privately immediately before each deployment. Strict deployments succeeded: source has 1,698 manifested files, target 1,681; every backend TS/JS/JSON file is accounted for. Only normal Convex generated bindings changed during deployment. Source installed extension bytes and registered contracts remained exact.

Source retains all 2,388 registered contracts unchanged. Target moves from 2,349 to 2,368, adding 19 current contracts and updating ten signatures, with zero removals. The additions cover operator handoff, saved-cart recovery, measured membership reads, resumable search indexing, Instagram configuration and legacy reusable migration. These are current candidate implementations already covered by delivery work, not new subsystems introduced here. All 2,368 shared contracts are identical between environments; the only source-only contracts are its 20 Community Events functions.

Actual operator create/save/open/publish and anonymous canonical readback passed on one owned nested-pattern page per environment. Exact nonempty block trees matched through publication at revision 3. Both owned pages were recoverably trashed and anonymous reads returned null. All 71 original pages, original appearance/identity, general/reading/plugin settings, menu locations and the repaired Clerk connection remained exact. Temporary sessions were revoked with refresh 401. All seven protected runtimes remain alive.

This closes the target metadata and backend candidate/installed parity portions of E18. It does not close final native/public artifact integration, local main-checkout integration, tracker PNG provenance, provider/human requirements, or the entire delivery goal. Reuse the already completed native recovery and four-pack Website bundle acceptance; do not repeat identical passes.

Evidence directory: `output/candidate-parity-20261006/`. Private baselines and full data/storage backups live only under the existing acceptance-secrets directory. No push; preserve the owner's untracked handoff.
