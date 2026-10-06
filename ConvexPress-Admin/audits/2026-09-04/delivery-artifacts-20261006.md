# Delivery artifact checkpoint — October 6, 2026

Candidate `e0e2fd34` has an isolated production Admin renderer and compiled Electron main/preload assembly under `output/delivery-artifacts-20261006/native-app`. The normal Vite build passed in22.54s with relative Electron asset paths and standalone-control-plane mode. Both tsup builds passed; wizard and credential assets are included. The native manifest seals 2468 files. Existing broad chunk-size advisories remain; no warning threshold was changed.

This assembly still needs actual production-native launch acceptance. It is not a signed installer or self-contained dependency distribution. Earlier native authoring/conflict/session acceptance remains valid source evidence, but does not substitute for launching this assembly.

The accepted production Website artifact at `output/candidate-native-20261006/bundle-green-dist` is retained. There are no Website or block source changes from its accepted `ffc4ddcc` commit to this candidate. `website-artifact-manifest.json` seals all1654 files, including server/server.js. Earlier four-pack hydration/search/mobile-menu acceptance and main/chunk budget results remain applicable without a repeated rebuild. Backend candidate parity is recorded separately in `candidate-backend-parity-20261006.md`.

A read-only Git merge-tree of current main and candidate succeeded without conflicts. Main's only production-source changes relative to the common base are generated API bindings: generator formatting and removal of old Community Events type entries. Main's audit notes and handoff can be preserved by the merge. No merge or checkout mutation has occurred; user work and all protected runtimes remain intact. Recompute the merge against current main immediately before eventual local integration.

Next: launch the isolated production native assembly with a private profile, verify its exact Website/backend pairing, reconcile installed example consumers before final rollout, and safely integrate locally. The four provider-dependent rows, actual AI generation and public HTTPS prerequisite remain explicit. No push.
