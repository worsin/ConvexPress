# Existing verified media readiness contract — 2026-09-05

Root's live red evidence is `output/aster-house/content-promotion/cloud-existing-media-readiness-red.json`: the authenticated target returned ready for the already-promoted original, while the controller persisted `failed / SITE_REVIEW_FAILED`. No additional upload or Apply occurred. The second operator's explicit live-instance permission requirement correctly denied access until root granted it; that is separate from this defect.

The target planner already resolves a media record's current target storage when no explicit binding is supplied and checks actual storage SHA-256 and size. Its durable plan contains the verified storage identity, and its digest binds that plan plus the manifest and supplied bindings. Three controller gates incorrectly required an explicit binding for every media record: review completion, public media readiness and Apply-envelope validation.

## Repair

Target `operations:dryRun` now returns a bounded `verifiedMedia` projection from that SAME plan: reviewed key, storage ID, actual hash and size, `binding` or `existing-target` resolution, and the resolved target record ID. The planner, receipt digest, stored original manifest, bindings and optimistic Apply algorithm are unchanged. Actual target Apply still replans and refuses changed/deleted bytes or target content.

The controller stores this explicit evidence in its existing immutable review JSON/fingerprint. One shared readiness helper is used by all three gates. Proof must match source hash/size, the selected media key, the exact target change and resolution path. Explicit-binding proof must use that exact supplied storage ID; existing-target proof requires a non-null matching target record and no contradictory explicit binding. Missing/duplicate/extra/mismatched proof cannot establish readiness. `mediaProvided` now counts validated resolutions for the new contract, so the UI does not falsely demand another production copy.

For older target responses and saved receipts that omit `verifiedMedia`, the former conservative explicit-binding requirement remains. Omission never authorizes an unbound existing target. New responses always emit the evidence array. This adds no schema fields or schema-version bump and performs no uploads, plugin changes, automatic bindings, receipt rewriting or Apply.

A valid ready review can now be consumed by the existing recovery inspection path under its owner. Recovery still requires its separate beneficiary grant/confirmation; normal transfer ledger ownership is not changed. Existing authenticated authoring permissions may independently permit a ready review of an already-owned target media record; readiness is not permission to trigger an upload or automatic Apply.

## Verification and deployment

- Actual registered target→broker regression first reproduced `failed` despite target readiness, then passes without explicit bindings. It verifies durable proof, `mediaReady`, provided count, Apply eligibility and recovery inspection of the fresh own review.
- Corruption cases refuse target-ID-only claims, omitted proof, wrong hash/size/storage/key/target evidence. A deleted file blocks a subsequent review; deleting it after review causes the actual target Apply mutation to reject while preserving the authored media row.
- Full promotion regression logs: `/tmp/mapped-media-final-tests.log`. Site/controller/consumer typechecks and generated negative contract checks are recorded in `/tmp/mapped-media-final-*-types.log` and `/tmp/mapped-media-contract-check.log`.
- Offline API: 700 site modules. Compact contracts: 2,019 functions / 1,904 DTOs; 439 existing unknown boundaries unchanged. Controller bindings: 114 modules / two components.
- Global diff check and controller binding check pass. Six owned handler/policy/test files were formatted; no frontend edits were required.

Deploy controller FIRST, then both site backends. The new controller accepts legacy target responses conservatively; the old controller's strict response schema cannot accept the new evidence property. Use a NEW preview request key because the failed immutable receipt is retained. No data migration, repeated upload or Apply is needed to prove this fix. Root owns deployment and live recovery continuation; this agent performed no provider calls.


## Root live cross-operator acceptance completed — 2026-09-05

`output/aster-house/content-promotion/cloud-media-recovery-acceptance.json` proves the second operator's fresh unbound preview was reviewed with one verified media resolution, then explicit recovery preparation/confirmation and repeat used the same recovery receipt and storage ID. Original creator and original review fingerprint were preserved; transfer dispatch count stayed one, production media count stayed one, and a separate bound re-review was ready without another Apply. Root then revoked the temporary exact live-instance grant: repeat confirmation was denied. The synthetic operator was deactivated and current-identity lookup was denied. The red/green existing-media readiness artifacts preserve the earlier failure and repair. These are real signed-session cloud observations, not native recovery UI acceptance.
