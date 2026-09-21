# Provisioning typecheck parity — outcome

The cloud initialization failure was caused by fresh Convex API generation, not a different TypeScript lib configuration. Convex 1.39.1 excludes multi-dot filenames such as `*.test.ts` from deployment, but does not exclude `__tests__` directories. It discovered `commerce/__tests__/handlerHarness.ts` and imported it through `_generated/api.d.ts`; imports override tsconfig exclusions. This brought ES2023 test-only array methods into the ES2021 backend check. Three fixture files had the same deployment-boundary defect.

Renamed the harness and three fixtures to `*.test-support.ts`, updated their imports, and regenerated the backend API from 684 production modules. Fresh full-API inference also exposed two weak inferred callback boundaries; authoring fields now have an explicit finite field union, and page route patterns/string parts have explicit types. No compiler suppression or lib broadening was added.

`generate-local-api.mjs` provides offline API generation from the installed Convex template using its production file-discovery rules, and fails if a test-directory helper would be deployed. Its regression invokes the real script: an ordinary test-directory helper is rejected; its multi-dot replacement is excluded while production exports remain represented. Generated output strips trailing whitespace.

Provisioning preparation now generates and checks the actual backend API before copying. It includes the frozen TypeScript compiler plus Node/bcrypt declarations, regenerates/checks the copied backend, and then copies the payload outside the checkout to the OS temporary directory and runs it with PATH empty. The isolated check runs extension/API generation, the payload's own TypeScript compiler, Convex CLI version, and a native esbuild transform. Packaged deployment retains `--typecheck enable`; the previous typecheck/codegen disabling flags were removed. The payload completion marker is only written after isolated verification passes.

Verification:

- Source and staged backend TypeScript checks: pass after fresh API generation.
- Fully isolated payload preparation: pass, 90 frozen packages, Convex 1.39.1, darwin/arm64, empty PATH. Executed under Node; no Electron/native application or provider was launched.
- Regressions covering renamed fixtures, commerce/forms/shipping/WordPress, authoring, and runtime preparation: 968 pass, 0 fail, 2,375 assertions across 47 files.
- Final runtime/API-discovery subset: 4 pass.
- Consumer typed API freshness: pass.
- `git diff --check`: pass.

The desktop scoped compiler separately reported TS6059 for the root-owned hosting/publish.ts import of a control-plane providerApi module outside desktop rootDir; root was notified and owns that shared-type boundary. This does not affect the verified backend payload.

Root may retry cloud initialization with the repaired source. Packaged acceptance must rebuild its provisioning resource through the updated preparation script. No cloud action, browser interaction, external mutation, commit, or push was performed here.
