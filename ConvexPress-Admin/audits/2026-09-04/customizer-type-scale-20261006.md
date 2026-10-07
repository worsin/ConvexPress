# Customizer type scale — October 6, 2026

E80 is repaired. Type scale now changes rendered typography in the production Website and shares the same compilation rule with BlockDemo. This closes the bounded missing implementation; the full E09 Customizer matrix and overall delivery goal remain open.

## Failure and repair boundary

The preceding E79 trial proved the control updated `--type-scale` to 0.94/1.06 while the actual Core catalog heading remained 30px and its eyebrow 11px. No consumer existed. The required workflow is a native unsaved typography change, visible in the actual Website, with exact reset and no unintended change to root-based layout.

A shared PostCSS plugin runs after Tailwind/import compilation. It scales explicit `font-size` and only the size token in `font` shorthand, including responsive clamp/viewport/container sizes. Inherited and parent-relative sizes are preserved to avoid multiplying twice. Root metrics, spacing, widths and unrelated declarations remain untouched. Website and BlockDemo body text start at 1rem. The finite settings mapping emits an explicit comfortable factor of 1, including for unknown inputs. The SDK contract documents imported CSS, size-variable and runtime CSS boundaries.

## Verification

- Three original compile tests: 2 failed against the empty plugin before implementation, then all passed. Expanded focused suite: 12 tests, 71 assertions passing. Covers compiled utilities, responsive sizes, shorthand parsing, nested family fallbacks, unchanged root/relative metrics, idempotence, palette/settings parity and finite reset values.
- Website TypeScript and changed-file lint pass. Website client/server production build and separate BlockDemo production build pass; existing chunk/dynamic-import advisories remain. Compiled Website CSS has 376 scaled font-size declarations; remaining unique values are inherit, zero and parent-relative em/% sizes.
- Actual production Website against the existing source staging database, with a local preview-message test host: 32 catalog cases (four packs × 390/1280 × comfortable/compact/spacious/reset). Every h1 changes by exactly 0.94/1.06; original two products remain present, viewport widths are exact, root remains 16px, grid width/gap unchanged, no horizontal overflow, and full measured reset matches the baseline.
- Representative desktop headings: Core/Depot 30→28.2/31.8px; Journal 60→56.4/63.6px; Aster 120→112.8/127.2px. Mobile baselines 24/36/24/48px scale by the same factors.
- The existing published Fieldwork authored page exercises canonical SDK and pack styling. Four packs × four scale/reset states: 16 cases, 288 h1/h2/h3/paragraph font measurements all match the factor. Authored text and root metrics remain unchanged; exact measured reset, no overflow. Core hero 89.6→84.224/94.976px; Depot's owned smaller heading 28.16→26.4704/29.8496px.
- Real isolated native Electron33792 using main Admin4105 and source4860: opened Typography/Shop preview, changed Compact then Spacious, observed the actual iframe, undid Spacious→Compact→Default. Everything published returned. No Save draft or Publish. Original Live4870 selection restored and normal signout verified.

## Evidence limitations and rejected attempts

The first build exposed misplaced config insertion inside Babel; fixed before the successful build. Initial typecheck exposed a missing mjs declaration, repaired with a Vite-derived declaration. Two test-log paths were wrong before execution and were corrected; they are not passes. Initial browser matrix sampled old pack documents/SSR state before preview hydration, and a later baseline sampled the default assistant sidebar before its draft changed to drawer. These attempts are retained separately and rejected. Accepted catalog data is `rendered-catalog-accepted.json`, verified for exact factors, dimensions, products, reset and no overflow. Style-tag text filtering is unsupported by the browser locator and was replaced by reading computed state. No product workaround was added for harness failures.

## Preservation

The entire source appearance snapshot, including revision, exactly matches preflight. API session logged out and refresh returns401. Owned native, Website4322 and test-host4333 processes stopped; native private profile removed after exit. Existing owner Electron, Admin, BlockDemo and four example preview processes retained. No source/backend data mutation, backend deployment, publication, purchase or push.

Evidence directory: `output/customizer-type-scale-20261006/` — red/green logs, type/lint/build outputs, accepted catalog/SDK measurements, native Compact/Spacious/reset screenshots, Fieldwork screenshot and preservation/cleanup receipts. Original E80 failure remains in `output/customizer-density-20261006/type-scale-noop.json`. Goal active; 137 tracked blocks, 117 Verified / 20 In progress unchanged, not an overall completion percentage.
