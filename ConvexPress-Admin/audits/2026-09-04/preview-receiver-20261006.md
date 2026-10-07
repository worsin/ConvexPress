# Preview receiver teardown repair

The receiver-remount lifecycle now recovers automatically. This establishes a concrete transport defect and repair, not proof that remount caused the original E99 Field/Studio history observation.

## Cause and change

EmbeddedDocumentPreview's effect cleanup calls the Website receiver's close function. That clears the visible document and closes its MessagePort, but previously sent no notification to the native sender. The sender retained rendered status and its existing connection. No iframe load occurs for an in-document receiver remount, so the host's navigation cleanup does not run. Fresh publishes then use the abandoned channel.

The receiver now sends an exact-shape, channel-generation-bound receiver-closed message before closing. The sender retires that channel and notifies native renewal. Renewal's existing paused/fresh-read path establishes a new challenge and generation on its next read; no cached authorization or old document is replayed. Rejected documents retain terminal rejection rather than becoming retries. Wrong-generation or extra-field closure messages are ignored. Connection state reflects a closed sender.

## Evidence

- A new real-MessagePort test failed before the patch: after receiver.close(), visible content was null but host delivery was rendered instead of closed.
- New integration coverage uses the production native renewal and both production transport endpoints. Closing/remounting the receiver without an iframe load changes connected to paused, then a second fresh read creates a second channel and renders the exact fixture document automatically.
- Additional tests preserve exact closure shape/generation checks, expiration revocation and refusal to publish on a closed sender. Existing rejected-document tests remain passing.
- Isolated actual Electron process43478 loaded a two-origin fixture on4340/4341 built from current production transport/renewal modules. Clicking Remount Website receiver produced paused with cleared content, then connected with content preserved, receiver mounts2 and channel count2. AX receipt and inspected screenshot: output/preview-receiver-20261006/native-remounted.{txt,png}.
- This native fixture has no backend, authoring UI, authenticated account or actual revision-history action. Its revision7 text is fixture content. It proves real Electron window/iframe/MessagePort recovery only.

## Verification and preservation

Preview suite:24tests/156assertions pass. Native renewal suite:12tests/56assertions pass. Website TypeScript passes. The full Website command first exposed an outdated Customizer recovery mock missing ImageSetting; the test boundary was updated, without a product Customizer change. A subsequent run hit the renderer subprocess wrapper's default5000ms timeout; the same web suite passes with a bounded30000ms test timeout:695tests/2372assertions. Orders passes1test/1assertion; BlockDemo passes13tests/170assertions. Tooling has16passes and1existing route-inventory failure: reserved page policy omits `/api/public-files/$storageId` found in the actual generated Website routes. Neither policy nor route tree is changed by this patch. The full Website command is therefore not green; the route-policy reconciliation remains a separate tracked follow-up, not a preview regression.

The first native fixture attempt bound browser timer functions directly to a clock object, causing an illegal receiver-context call. The fixture now uses arrow wrappers, as production already does; no production timer change. Initial wrong-path test/log invocations were corrected and are not acceptance evidence.

Stopped owned Electron43478 and server43786 (initial owned server43461 was replaced while correcting the fixture). Removed the owned private profile. All seven protected processes39198/62672/65092/10193/10207/10220/19946 remain alive. No backend calls, site data edits, session changes, protected-runtime restarts or push.

Next: incorporate this frontend delta into isolated actual Admin/Website artifacts and exercise the original native history workflow. E99 remains open for the original causal link; provider/HTTPS and final state/mobile/motion requirements remain explicit.
