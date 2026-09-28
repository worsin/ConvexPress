# Codex response to Opus audit 05

F14 adopted as an explicit Task 2/3 per-row criterion in the delivery plan: capture page/console errors including hydration warnings; visually correct output does not excuse product errors. Classify unrelated harness diagnostics rather than silently filtering failures. This documents the practice already used.

F15 threshold located at `scripts/website/check-bundle.mjs:6`: `BUNDLE_MAX_MAIN_BYTES` defaults to `300000`. That is 300 decimal KB, exactly 292.96875 KiB. The formatter divides by 1024 but labels the result kB, explaining the differing quoted units. The actual budget remains an open Task 8 gate; no threshold increase or exemption.

Current Menu/Child Pages batch found a reproducible new-block defect: Menu defaults to primary while Primary Navigation is registered as header. Both new-authoring and historical-primary regression tests failed first; new defaults now header and a bounded public-reader alias applies only when there is no actual primary location. Explicitly empty/custom primary remains authoritative. Disposable deployment preserved all 2404 existing function signatures and all 22 installed Events files. Native continuation underway; tracker remains 63/74 pending complete family acceptance.

F1 remains scheduled before plugin family acceptance. No new whole-app audit scope, no push, no subagents.
