# Reference coverage and Events lifecycle acceptance

## Delivered

The block check now exercises actual backend display policy against every generated reference-bearing contract with all installed plugins enabled and the structural index ready. It covers 27 blocks / 34 reference fields. A deliberately unsupported reference kind fails through production displayContext; its exact block/field is reported. Synced content readiness and Events disable/re-enable remain explicit policy gates. Production reference allowlists are unchanged. The block kit documents this gate and its limits.

## Actual isolated Aster lifecycle

Normal authenticated settings mutations disabled then restored only Events. The open public list withdrew its two events; fresh list/detail requests displayed404. Admin reads returned PLUGIN_DISABLED. The public Dashboard registry removed then restored Events. Re-enabling restored both complete event records and public detail rendering. Full plugin values, appearance draft and empty email queue match the baseline; normal settings audit timestamps may advance. Owned sessions were revoked with refresh401 verification. No backend deployment, outbound email, user process restart or push.

Evidence: output/extension-lifecycle-20261006/{before.json,disable-intent.json,disable-result.json,restore-intent.json,restore-result.json,disabled-events.png,restored-event.png}. The original Aster browser route was restored.

## Checks and limits

- Reference gate: 1 test / 10 assertions; full check:blocks passes.
- Generated extension scaffold: 9 tests / 159 assertions, including actual generated registered handlers, namespace isolation and sibling search behavior. Disposable scaffold removed by test cleanup.
- Block sync check and distributed kit parity pass.
- Normal live Aster AI compose returned CONFIGURATION_ERROR requiring provider/API key. No proposal or model response was accepted. Stored-key absence was not used alone to infer unavailable environment credentials.

This closes reference completeness and bounded reference Events API/public lifecycle. It does not establish native Extensions UI, rendered customer Dashboard, deployment of a newly generated extension, actual AI generation, or the remaining mixed native composition/promotion workflows. The overall delivery goal stays active.
