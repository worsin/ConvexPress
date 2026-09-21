# Cloud runtime readiness and real promotion review

The first real Aster staging-to-production preview stopped before allocating a review because both cloud instances still stored `provisioning: unprovisioned`. Both were compatible and healthy. Source inspection found no production code that transitioned an attached instance to ready; fixtures had started ready and concealed the missing transition.

`connections/mutations.ts` now reconciles an unprovisioned instance to ready only when the existing connection test has matched its exact website/instance identity, successfully exercised the current controller's signed authority, and obtained healthy storage/auth plus compatible versions. Credential replacement and revocation reset readiness. Active or failed provisioning jobs retain their own state and error evidence. Public health alone or storing credentials cannot establish readiness. Existing revision, credential, hierarchy and authorization checks prevent late observations from changing a replaced target.

The regression first failed twice with the real unprovisioned starting state. The focused connection and promotion suites then passed: 25 tests,150 assertions. The control-plane `bun run check-types` passed. An earlier unscoped `tsc --noEmit` incorrectly selected the parent monorepo configuration; its output is not a scoped application regression. Typed control-plane deployment succeeded. No site schema or content changes were needed for this repair.

Real signed checks subsequently returned healthy for both Aster connections, and authorized instance readback showed ready/ok/compatible for staging and production. No raw record patch or readiness bypass was used.

The newly deployed promotion broker was then exercised through authenticated public APIs:

- Member page review `p975cy043w783hsp2a4pwkt8g18dvjjf` discovered five authored records: page, plan, plan benefit, media and restriction. It correctly returned blocked for missing target membership/LMS support and the missing verified image upload.
- A new staging draft, Materials and care (`x17t6pa9jzta94y7wqks6hs7kn8dv70p`), provided real text-only content. Review `p97b1g6r3t0tvgjm14tx5md8zh8dtq0r` returned reviewed with one record and no issues. The complete source document, including bold text, remained unchanged.
- Repeating the exact request returned the same receipt; authorized receipt readback returned reviewed. Production lookup confirmed that the draft had not been created there. Both receipts report `canApply: false`; no apply call exists in this broker checkpoint.

Evidence: root `output/aster-house/content-promotion/{blocked-member-review,plain-content-review,preview-readback}.json` and the site-run manifest. Preview is now proven live; native review, media transfer, before-value diffs, apply/reconciliation, operational-data preservation during actual apply, and large-graph processing remain separate gates.
