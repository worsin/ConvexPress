# Permission boundaries and native recovery — September 21

Original audit A06 and A08 are accepted at their stated scope. The production goal remains incomplete: eight original audit items are accepted and sixteen remain open, alongside the template/block/handoff requirements.

## Product changes

Authorization overflow already failed closed. It now returns a dedicated structured capacity error. Both native shell/content error boundaries explain that access is paused until an administrator reduces the affected rules, then offer recovery. They also recognize the exact legacy structured capacity error for rolling controller updates; unrelated errors retain their original treatment.

Live acceptance exposed a separate defect: the full Sites website view registered twelve subscriptions, exceeding the isolated backend's eight-concurrent-query limit when permission changes invalidated them together. The socket repeatedly reconnected while the old portfolio remained visible. An HTTP probe also encountered overload during that failing transition; its failed assertion is not passing evidence.

The controller now shares capability checks across panels within the authenticated operator's lifetime. It deduplicates complete selector/target tuples, splits batches at the existing 32-check backend bound, and discards replaced batch results. Operator changes recreate the provider. The Website page reuses its already-authorized portfolio description instead of querying the entire business website list again. Server authorization and policy limits are unchanged. Every mutation retains backend authorization.

The tested Sites view now has seven steady subscriptions. This is evidence for the exercised view, not a guarantee that every possible open dialog, provider panel or environment count fits seven subscriptions.

## A06 acceptance

- Deployed current production controller handlers to a new isolated Docker database at4890/4891. Strict Convex deployment/typechecking passed. At deployment all224 non-generated source files matched. Final comparison has223 matches and one test-only change strengthening the independent direct-limit regression; runtime source is unchanged. Five generated API files are excluded from that comparison. No fixture-only backend handler was deployed.
- Created500 earlier inactive role rules for `website.read`, then a later applicable administrator deny. Exactly500 permits the positive control;501 fails closed for single, batch and portfolio queries. Moving an earlier irrelevant rule out of the action group restores an exactly500-rule set in which the final deny wins. Revoking that deny restores access.
- Independently exercised the per-user boundary with500 direct rules and a501st applicable deny, without overflowing the relevant global action group. Single/batch/context queries return the typed capacity error. At500 the final direct deny wins; revoking it restores access.
- The final real Electron run used the same owned process30529. A fully loaded48-site portfolio disappeared928ms after the direct-rule overflow mutation, without reload. After repair, Try Again restored it. An ordinary `website.update` deny removed Edit/Attach controls in971ms while preserving readable portfolio access; reversal restored editing. Switching to a different website then loaded the correct controls.
- That67-second final acceptance window had zero controller concurrency errors and zero native socket reconnects. The recovered window and error screen were inspected; the native document has no horizontal overflow.
- Five dependency-changing portfolio queries over48 website/48 staging-environment records took90.51–159ms, median98.3ms. These are unprovisioned metadata fixtures with reserved `.invalid` origins, not48 provisioned site databases. The measurements are request-level samples, not a fleet performance SLA.

## A08 acceptance

An actual claimed non-owner administrator attempted to activate owner-targeting denies through both status changes and upsert. All twelve attempts were rejected: user/role targets crossed with inactive/revoked/expired starting states and both activation paths. Denied writes preserved owner access. Authorized owner activation produced the expected explicit deny, and owner revocation restored access. Ordinary non-owner permission management also passed as a positive control.

Registered-handler regressions additionally assert unchanged permission status and no queued session revocations after rejected owner-targeting writes.

## Verification

- Control-plane suite:383 tests /2288 assertions passed.
- Admin frontend suite:488 tests /1957 assertions passed. The isolated React harnesses also cover both error boundaries, both error formats, shared-check deduplication, exact target separation, loading after target changes, reactive denies, 65 checks split32/32/1, cleanup and recovery under StrictMode. The final focused25-test rerun also passed after strengthening target-specific decision mapping and the independent direct-rule fixture. Wrapper counts are not additional independent behavior counts.
- Final Admin and controller TypeScript checks passed. Admin production build passed with the existing large-chunk warning.
- Focused frontend lint and `git diff --check` passed. No dependency, schema, site database or provider configuration change.

## Preservation and evidence

Artifacts are in worktree-root `output/permission-boundaries-20260921/`: owner-protection, role/direct overflow and recovery receipts; source parity; benchmark; native subscription diagnosis; native-final/concurrency/fit receipts and screenshots; final suite/type/build/lint logs; cleanup receipt.

The temporary controller, its unique data volume, private environment files, credentials and native profile were removed. API owner sessions were signed out. The final native menu sign-out attempt timed out; no sign-out success is claimed for it. The owned Electron process was closed and its profile plus isolated authentication database were destroyed. All52 other running worker containers and the four original local application/tunnel processes were preserved. Existing controller/site deployments were not modified.

Earlier failed native observations are superseded by the final post-fix run, not erased. A selector timeout during website navigation was corrected to match the rendered accessible name; no product workaround or policy-limit increase was used.

A04/A07, commerce, deployment/domain, packaging, backup/fleet, full block/template acceptance and remote CI remain open. This checkpoint does not certify those requirements.
