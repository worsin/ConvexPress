# Assistant memory policy and brief grounding

Source: `9948e604`, followed by live-test correction `715c0f09`. This closes the bounded disabled-memory and brief-context defects; it does not complete the Assistant block or the delivery goal.

## Reproduction and repair boundary

A registered-query regression returned a saved preference from `contextBundle` after `commerce.assistant.memoryEnabled` became false. The write helper likewise never read current policy, allowing a provider turn started earlier to retain a new fact after the operator disabled memory. The repair excludes stored facts from grounding, checks policy transactionally at each memory write and preserves the generated answer when only a late memory save is refused. Existing preferences remain accessible through authorized list/forget operations and are not deleted or given a fresh retention period.

The brief action cached by product IDs and saved facts alone. Nine initial action regressions exposed stale results for changed quantity, variant identity, line price, catalog availability/price, store rules, provider model and memory policy, plus the disabled Assistant gate. The repair reads current catalog context before lookup and fingerprints that context and relevant configuration with SHA-256. It also refuses old memory-enabled/legacy personalized caches when memory is disabled, including generated search facets. Curated public facets retain their separate behavior.

The first installed acceptance caught an additional false cache miss: ProductCard `pricing.pricedAt` changes when the price is observed. A new regression failed, then passed after excluding only this observation timestamp; resolved prices and sale schedules remain part of the fingerprint. The initial installed attempt is explicitly not accepted in its receipt. All original rows were preserved and its disposable cart/memory/thread were cleaned before retry.

## Validation

- Final commerce suite: 415 passed, 0 failed, 2,029 assertions across 35 files.
- Focused policy coverage includes disabled reads/writes, late provider writes, re-enable without deletion, authorized Forget, foreign ownership, legacy personalized cache refusal and fresh non-memory cache reuse.
- Strict backend types passed before deployment; final frozen deployment also runs strict type checking.
- Media writer coverage: 1,490 classified writes, 30 owner tables, no bypasses; reusable consumers remain covered.
- Delivery inventory remains exactly 137 rows: 134 Verified, 3 In progress.

## Installed acceptance

Final source `715c0f09` is installed on original Alpha: 2,028 captured tracked files, 1,783 deployed modules, strict dry-run/install successful, existing operator session preserved. Owned controller sessions signed out and management tokens cleared locally. An early install attempt refused to run until its dry-run receipt existed; it made no deployment change. No production data import or schema contraction is involved. Existing original settings are not toggled during this acceptance: disabled-mode behavior is proven with registered Convex regressions, while actual installed API/provider checks cover memory grounding/forgetting and quantity-sensitive brief reuse.

Actual installed checks passed: normal guest memory save appears in grounding, Forget removes it, an unchanged cart reuses its brief, adding one unit regenerates it, and repeating the changed cart reuses the new brief. Both fresh responses used the configured `anthropic/claude-sonnet-4.6` provider. The timestamp false miss is resolved in the actual cart/related-card path.

All original selected rows compare exactly: 17 users, 9 posts, 50 storage records, 14 settings documents, 15 emailQueue records, 9 Assistant sessions, 8 messages, 1 saved preference, 4 carts and 2 cart lines. No settings were changed. Owned cart, thread and preferences are empty, token file removed; only empty owned session/cart records and private briefs with normal 30-minute expiry remain. No new browser/native processes were launched for this backend check. All 14 protected runtimes remain alive.

Raw evidence: `output/assistant-memory-brief-20261007/` (regressions and initial installed failure) and `output/assistant-memory-brief-final-20261007/` (final captured candidate and acceptance). Private original data/source backups stay outside the repository.

## Remaining delivery work

Backend request idempotency and bounded/public catalog readers remain explicit Assistant requirements. Actual selected-resource AI composition/style/promotion and final installed candidate parity remain separate delivery gates. Reuse E110/E111, native preview, Gamma and migration evidence. Claude audit64 remains the latest reviewed advisory; do not wait for another audit or reopen accepted work.
