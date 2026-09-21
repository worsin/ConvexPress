# Sites background interaction isolation

Actual Electron inspection found two accessible main landmarks while Sites covered the underlying site runtime. Both frames remained in the accessibility tree and the covered frame lacked an inert boundary. This reproduced an interaction-boundary defect; it did not reproduce or establish the cause of the owner's earlier mouse/scroll failure.

`StandaloneApp.tsx` now marks only the covered runtime surface inert and aria-hidden while the full Sites workspace is open. The runtime remains mounted with its existing layout. The normal accessible surface is restored when Sites closes.

Native acceptance on the owned hardening Electron process confirmed one accessible main with Sites open, background inert, twelve Tab transitions without reaching the covered runtime, and wheel scrolling from2257 to1707 in the visible workspace. Escape closed Sites; one accessible main remained and the runtime was no longer inert. Evidence is `output/aster-house/sites-interaction-acceptance.json`. Full Admin typecheck and broader release acceptance are tracked with the enclosing batch.

## Unsaved draft lifecycle correction

Subsequent actual native verification reproduced a separate defect: entering “Unsaved Sites lifecycle check” in Quick Draft, opening Sites, then closing with Escape erased the unsaved title. Opening Sites skipped connection queries and cleared authorization shell checks; the resulting absent target cleared the runtime manager and unmounted the editor. The earlier inert boundary alone did not preserve that lifecycle.

`StandaloneApp.tsx` now keeps the current selected environment's connection query and business authorization checks subscribed while Sites is open. This preserves the target and editor without retaining stale authority when permissions change. Actual red-to-green proof confirms the exact unsaved title remains both while the editor is covered and after Escape, with the covered surface inert, one accessible main, and zero captured page errors. The synthetic title was cleared afterward and never saved. Full Admin TypeScript passed. Evidence: `output/aster-house/sites-draft-lifecycle-red.json` and `sites-draft-lifecycle-acceptance.json`. This explains the reproduced draft loss, not every earlier mouse/scroll symptom.

## Acceptance operator credential provenance

The isolated acceptance operator is Claude-generated `claude.owner@convexpress.local`, not the owner's real account. When its prior session could no longer authenticate and its generated password was unavailable, root verified the exact controller user and Better Auth credential account, rotated only that synthetic account's password through the protected deployment adapter, and signed in through the normal native login. The new random credential is retained only in the protected local acceptance secrets directory (file mode0600); no secret is included here. No role, customer account, fleet identity or human credential was changed, and no email was sent.
