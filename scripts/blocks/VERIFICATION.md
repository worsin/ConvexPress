# Canonical block verification evidence

`check:blocks --tracker` reconciles inventory and minimum repository evidence. A passing result does not promote a tracker row or replace native authoring, live data/action, accessibility, motion, responsive or customer acceptance.

Blocks may keep their meaningful tests beside their source. The existing centralized renderer suite can alternatively produce an execution receipt without adding placeholder block-local tests:

```sh
# From ConvexPress-Website/apps/web (create the output directory first):
bun src/templates/sdk/block-renderer/run-tests.fixture.mjs --evidence-out ../../../output/block-evidence/renderer-tests.json

# From the repository root, after that run succeeds:
bun run check:blocks --tracker --renderer-evidence output/block-evidence/renderer-tests.json
```

An explicit complete flat tracker snapshot may be used with `--tracker-file path` instead of `--tracker`.

The receipt maps every discovered block's current version to every example actually exercised under every installed pack. It is emitted only after the entire renderer suite exits successfully and the recorded example set is complete. A failed rerun removes the previous receipt at the requested output path. The receipt identifies its runner, test, runtime and completion time, and hashes the relevant source trees and dependency manifests before and after execution. Changes to a block, shared primitive, adapter, backend foundation, test, kit input or dependency manifest require another run. Missing, duplicate, foreign, partial, failed and stale evidence is rejected.

This is renderer-test coverage using controlled data adapters. It does not certify deployed backend behavior. The original screenshot requirements remain in force; screenshot identity, source/capture provenance and broader acceptance must also be reviewed in the delivery evidence index. A successful receipt for all137blocks does not mean all137have passed live acceptance.

Without `--renderer-evidence`, the existing block-local test-file requirement remains unchanged. An explicitly supplied invalid receipt always fails; it cannot fall back to a local test file.
