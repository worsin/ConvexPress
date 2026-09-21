# Packaged macOS onboarding and provisioning — September 20

The unsigned macOS arm64 application builds and runs outside the source checkout. This is a delivered-app acceptance result, not signed installer, Windows, clean-machine, provider deployment or full C02 acceptance.

## Product repairs

- The provisioning payload omitted five scripts imported by its deployment safety gate. Those scripts now ship, and the isolated embedded-runtime check executes the actual safety gate. The initial package failed with a missing module; the repaired package passes.
- Commerce stock policy imported a foundation outside the staged backend. It now imports the byte-identical deployed foundation. Five stock-policy regressions pass; the staged backend compiler passes.
- The standalone bootstrap ignored the native wizard's login handoff. It now consumes the credentials before its authentication request, signs in through the operator auth client, and presents a safe manual-retry message on failure. A storage cleanup failure prevents authentication. No failed handoff is retried on relaunch.

## Evidence

- Isolated source snapshot: all nine changed source/test files match the packaged build inputs by SHA-256. Admin types, native/web builds, actual package command and scoped lint pass (zero errors/warnings). Full Admin frontend suite: 472 passed; focused setup/auth tests: 18 passed.
- Bundled Convex CLI, API generation, deployment safety gates, TypeScript compiler and native bundler pass outside the checkout with an empty PATH, including Electron's embedded runtime. The payload contains 91 pinned packages and the safety gate classifies 1,478 writes across 29 owner tables.
- A copied `.app`, preserving framework symlinks, reports `app.isPackaged === true`, uses its own `app.asar`, and loads `convexpress-app://shell/index.html` with sandbox/context isolation enabled and Node integration disabled. Fresh profiles are outside the checkout.
- Real wizard controls: welcome, client selection, invalid URL refusal, Back recovery, connection test against the disposable controller, credential submission and launch. Final package signs in automatically and opens the isolated staging environment. Config readback contains neither the handoff nor its password.
- A second fresh profile submits an invalid password. The app displays the retry message, clears rejected credentials, and accepts a subsequent manual sign-in through the normal UI. Successful authentication clears the setup error, so a later sign-out returns to a clean login screen.
- Real packaged UI: 137 registered blocks, mouse-wheel movement from zero to 1,000 pixels, working sidebar links and no observed page errors. The earlier package also opened the existing canonical pricing page without saving content. Selected wizard, library, editor and recovery screenshots were inspected. This does not establish all-block interaction/design/motion acceptance or packaged live-preview acceptance.
- All disposable authenticated sessions were signed out. Owned app processes exited; the pre-fix profile's ignored handoff was explicitly removed. No site content, backend deployment, provider or DNS change was made. Original app/dev-server processes remain running.

Detailed logs, screenshots and JSON receipts: `output/packaged-native-20260920/`.

The first test copy rewrote framework symlinks and failed ICU startup; preserving the original relative links fixed the test fixture without a product change. An attempted ESLint invocation found no repository configuration; the repository's existing oxlint tool supplied the successful source lint. Neither event is counted as product acceptance.

Remaining: signed/notarized macOS distribution, Windows installer, clean-machine provisioning/deployment, interrupted provisioning recovery and the other original release gates. Only A05 and B08 retain full original-audit acceptance.
