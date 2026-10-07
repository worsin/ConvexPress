# Template registry bundle boundary — October 6, 2026

The complete production Website now passes the existing300000-byte main and550000-byte largest-client-chunk limits. Main is221047bytes, the template registry107632bytes, and the largest client chunk467019bytes. Raw evidence and exact Vite configuration hash: `output/candidate-native-20261006/bundle-final-receipt.json`.

## E106 cause and repair

The prior candidate's main bundle was318770bytes. The module inventory attributed66421rendered bytes to the compiled template registry before Vite adds dependency-preload tables. Source discovery is small, but its glob expands the installed surface loader graph into the entry chunk. Actual surface implementations were already lazy.

The existing Vite manualChunks function now gives `src/templates/sdk/registry.ts` a `template-registry` boundary. This keeps the stable installed-pack loader graph independently cacheable from frequently changed application code. It preserves synchronous manifest access and lazy surface resolution/preloading. The resulting registry contains only the registry, four manifests and Vite's preload helper. The app entry contains no canonical block renderer; its existing Core error/not-found fallbacks remain eager. No implementation, schema, provider, hydration protocol, budget threshold or dependency version changed. This is a chunk/cache boundary repair, not a claim of fewer total initial-download bytes.

## Validation

The original budget check failed before the configuration change. A clean complete CLI production build passes it after the change. Website strict types, four-pack/90-surface template contracts and the template SSR suite pass, including nested/reusable/custom canonical rendering and BlockDemo utility comparisons. Module inventories retain both before and after boundaries.

Actual production SSR/hydration was inspected in Core, Journal, Depot and Aster House. Each search overlay opened, received focus and closed successfully. Aster's390px mobile navigation opened with Home/sign-in/register and closed with focus returned to its trigger. Four desktop and one mobile capture were inspected. Browser logs contain only the expected development Clerk warning, no errors. These pages use the existing disposable source content; they are not newly authored example sites or a rerun of the entire block screenshot matrix.

Harness limitations are explicit: the first programmatic Vite inventory build produced client output only, so its missing server entry was not accepted as a product failure. A reused diagnostic output directory also retained a pre-repair main chunk and correctly failed the gate. Final acceptance uses a new output directory and the normal CLI build, including `server/server.js`; stale diagnostic chunks are excluded, not the checker. The isolated artifact needs a node_modules link to the existing package installation for SSR resolution.

Logs: `bundle-budget.log` (red), `bundle-green.log` (green), `bundle-production-build.log`, `bundle-repair-types.log`, `bundle-template-contracts.log`, `bundle-template-ssr.log`, `bundle-browser-log.json`. Final artifact: `output/candidate-native-20261006/bundle-green-dist`. The earlier `bundle-diagnostic-dist` is not the deliverable artifact.

`bundle-runtime/cleanup.json` records exact preservation of43 original source pages and appearance/general/reading/menu values, restoration of Core, API logout/refresh401 and shutdown of the owned production preview. The prior native batch already verified all71 original source/target pages. Seven protected processes remain alive; temporary browser closed and viewport reset. No push or user-handoff edit. Final installed artifact parity, full tracker provenance, external provider/HTTPS requirements and local delivery integration remain separate open gates.
