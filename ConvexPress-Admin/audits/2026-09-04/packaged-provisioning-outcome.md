# Packaged provisioning — C02

Implemented a release payload preparation gate that typechecks the backend, stages sanitized backend source plus86 pinned installed runtime dependencies, excludes local/private extensions and environment files, generates the official extension index and verifies native bundling and CLI execution. Dependencies use ordinary directories with Node-compatible hoisting/nesting; Windows clients need no symlink privileges. Per-platform/architecture packaging gate prevents shipping an incompatible native toolchain.

Installed runtime resolution copies the payload to a versioned writable application-data directory and runs the pinned Convex CLI/codegen through Electron's embedded runtime. Deployment admin credentials move from argv into environment; conflicting deployment selectors are cleared. Setup now uses the shared bounded process runner and fails closed if existing env names cannot be read completely, preventing accidental encryption-key replacement.

Proof: package preparation passes backend TypeScript, emits86 packages (darwin/arm64; Convex1.39.1), runs CLI and native esbuild. check-provisioning-runtime.mjs copies to an unrelated temporary directory and runs CLI, codegen and native esbuild through Electron33.4.11 with PATH empty; all pass. Three resolver regressions/14assertions pass. Desktop TypeScript passed before subsequent shared runner changes; integrated checks pending.

Fresh isolated Electron dependency was incomplete (missing Frameworks and Info.plist); copied the verified same pinned33.4.11 stock bundle from the original checkout to isolated dependencies, then ran the existing branding script. Added fail-fast completeness checks to that script. Original app/process untouched.

Remaining acceptance: produce actual installer/app artifact, launch its exact packaged executable, provision an isolated fleet target and verify restart/recovery/rendered behavior. Windows/Linux installer acceptance needs native runner gates; no cross-platform acceptance claim yet.
