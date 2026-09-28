# Codex response to audit 04

Reviewed against hardening source during the E20 native/public acceptance batch.

- Task1/F10 closure agrees with the current77-row and handoff reconciliation. Tracker remains60/77; no new row acceptance this batch.
- F13 is accepted for reproduction: the mutation catch discards the code and converts conflicts into generic autosave errors. I have not yet claimed a tested repair. I will adapt the suggested routing: blindly calling load() for a saved-revision CONFLICT can approve an unchanged private generation while retaining an obsolete document base, causing a repeat-conflict loop. Competing-generation review, a completed local Save, and a genuinely changed accepted revision need distinct decisions. Existing unknown-acknowledgement safeguards stay intact.
- E20 now has concrete bundle and native evidence:137 distinct Library dynamic entries,32owned entries, zero Library renderers reachable through static entry imports. Native iframe requested only hero-text-only, then added Paragraph only when inserted, then the selected Core Hero treatment. Real pointer selection still selects the corresponding native block.
- Public four-pack acceptance exposed a real hydration regression: a newly nested Suspense boundary retries a seed data grant after the parent installation effect revokes it. All8 public cases rendered the expected content/chunks but emitted React hydration errors, so they are not accepted. I am moving the loading boundary above grant installation and preloading exactly the SSR-marked definitions before hydration. The authority checks and revocation semantics remain unchanged. This is an active causal repair, not a completion claim.
- The existing main-entry size budget also fails; the earlier pre-change build already exceeded it (313.71KB against300KB). Preserve that final delivery gate separately from the per-block chunk proof.

Next: finish E20/E21 actual public/native acceptance and cleanup, then reproduce and repair F13 before returning to the remaining Task2 family rows. F1 remains before Task3 plugin batches. No push.

## Verified follow-through — cbdff4cd

E20/E21 batch committed locally, no push. Moving Suspense above installation plus selected SSR preloads resolved the reproduced revoked-seed hydration errors:16public cases (hero-first and ordinary-first,4packs,2widths) now pass with no errors/overflow and correct title behavior. Native incremental module loading, selection,save,reload and exact final3Library+CoreHero requests pass.137Library/32owned dynamic entries, zero static block imports.306renderer cases/5374assertions,9focused outer cases and12actual canonicalSSR fixtures pass; types/build/root block checks pass. Owned page removed;42original pages and appearance restored, owned sessions revoked/closed,userElectron39198 untouched.

Evidence/report: hardening ConvexPress-Admin/audits/2026-09-04/canonical-lazy-renderers-20260928.md and output/editor-lazy-renderers-20260928/. Existing main-bundle limit still fails309.29KiB/292.97KiB; not claiming global green. E22open,tracker60/77unchanged. Next F13 structured conflict reproduction/repair, thenTask2family rows.

## F13 verified and committed — 29632560

Structured DRAFT_CONFLICT now reads/reviews automatically. CONFLICT waits for a successful local Save or explicit resolution against the subscribed accepted revision before refreshing its private generation. Plain diagnostic text is not treated as a structured conflict; unknown acknowledgements remain manual reconciliation. Simultaneous accepted/private conflicts resolve in order without mutually disabling the needed choice.

Failing-before competing-generation and accepted-revision tests captured.66editor tests/1146outer assertions, final2affected isolated suites andAdmin types pass. Actual two owned native Electron profiles proved automatic competing draft review (inputretained/no genericerror/no Retry), then simultaneous saved/private conflict choice usability. Final exactacceptedrevision3/private tombstonegeneration5. The deliberately delayed in-flight local Save overlap is controlled regression evidence, not a native timing claim.

Ownedfixture deleted;42original pages/appearance preserved; bothowned sessions signedout/closed, APIrevoked,userPID39198 alive. Report: hardening ConvexPress-Admin/audits/2026-09-04/editor-autosave-conflicts-20260928.md. E23accepted as boundedE19follow-through;60Verified/77Inprogress unchanged. No push. Next remainingTask2family acceptance; F1beforeTask3, E22andmainbundlebudget stillopen.
