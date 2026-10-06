# Footer newsletter audience — October 6, 2026

E97 repairs the existing audience selection end to end. Task 5 and the full delivery goal remain active; tracker counts stay 117 Verified / 20 In progress.

## Repair

Previously every footer consumer ignored audienceId and subscribed to the general newsletter store. The native and on-site editors now select active mailing lists from the current installation, with pagination and preservation of off-page selections. General newsletter behavior remains available when no list is selected.

All four packs use the same consent form for an audience-bound cell. The backend authorizes only an active owned list exposed by the active published footer, then binds consent to a digest of that configuration and the list revision. Draft-only, hidden Minimal, foreign, inactive, malformed and stale offers refuse signup. Subscribers record the exact consent/privacy wording and footer pack/row/column source. Existing unsubscribes and bounces never reactivate through anonymous signup. A new signup receives a secret-bound on-page opt-out; duplicate signup does not rotate another subscriber's opt-out capability. This does not introduce an email delivery service or claim durable emailed unsubscribe links.

Appearance promotion exports a mailing-list dependency, not subscriber data. The existing dependency resolver maps it to one active, installation-owned destination list with the same name, or reports a missing/ambiguous dependency. Review pins the destination list state and apply rechecks it. Target consent and audience records stay local. An existing test fixture returned a shared target object; a prior mutation polluted later tests. Copying that object per manifest fixed the order-dependent failure.

## Evidence and limits

- Registered backend handlers:137 tests,1004 assertions,0 failures across audience, lead-magnet and promotion operations. Includes two independent test databases: source export, missing target refusal, owned target remapping, changed-list refusal, fresh apply, ambiguity refusal and no subscriber/consent copying.
- Actual component renders for all four packs plus mounted form consent, selected-list/digest envelope, opt-out and unavailable/loading cases pass. Existing footer cell and native editor regressions pass.
- Backend/controller/Admin/Website types and both app production builds pass. Changed-file oxlint:0 errors,9 existing warnings in promotion files. Writer/consumer coverage regenerated and verified; git diff whitespace check passes.
- Isolated trial4922 received a sealed copy of its installed source with this bounded patch after a private storage-inclusive backup. Strict deployment checks passed. All2394 prior functions retained;3 footer functions added. Only the existing exportManifest return contract changed. No source4860, target4870 or controller4720 deployment.
- Actual native Electron, owned profile/direct site-admin mode: selected General newsletter then the active test list, edited button text to Get studio letters, reviewed and published. UI showed Everything published; API readback retained the list ID and new button text. Actual Website showed the new text and required exact consent/privacy link.
- Actual Website signup with a synthetic address reached the intended list as subscribed. Undo this signup changed it to unsubscribed. A repeated consented signup returned the generic receipt and left the record unsubscribed. Archiving the test list made its public offer unavailable.
- This proves the native selector/public action and registered promotion boundary. A new native controller-broker cross-environment promotion was not run in this batch; final integrated promotion remains E09/Task8. No full repository-wide test claim.

Raw evidence: output/footer-newsletter-20261006/ including backend-tests.log, type/build logs, function-delta.json, native-receipt.json, subscribers-after-signup.json, subscribers-after-opt-out.json, subscribers-after-repeat.json, native-published.png, website-published.png, restoration.json and cleanup.json.

Original appearance values restored exactly with a concurrent-revision guard. Test subscriber remains unsubscribed; test list archived and consent history retained. Native sign-out observed; API logout followed by refresh401; owned native69111,Website68969,Admin69196 stopped, private profile removed, tab35closed. Trial container stopped, volume retained. All7 protected user/shared processes preserved. No push.

## Next

Reconcile Task5 aggregate checks against E63–E97 and existing lifecycle reports. Reuse accepted footer/header matrices. Close only covered checklist clauses; carry the explicit hosted HTTPS editing and final integrated promotion requirements forward.
