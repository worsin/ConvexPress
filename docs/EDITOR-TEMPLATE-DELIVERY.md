# Editor and template delivery

This is the working delivery entry point, not a declaration that every acceptance
gate is complete. The block tracker has **136 Verified rows and one In progress**.
Candidate `012255f2` is installed on all ten local environments, including the
accepted Assistant/AI fixes and completed legacy theme/layout retirement.
See [original fleet evidence](../ConvexPress-Admin/audits/2026-09-04/original-candidate-20261007.md) and [current candidate evidence](../ConvexPress-Admin/audits/2026-09-04/final-candidate-20261007.md).

## Open the examples

These four local candidate previews use separate site databases and authored
content. They are fictional demonstration businesses.

| Template | Website | Open |
| --- | --- | --- |
| Core | Fieldwork Studio | <http://127.0.0.1:4340> |
| Journal | Slow Current | <http://127.0.0.1:4341> |
| Depot | Common Supply | <http://127.0.0.1:4342> |
| Aster House | Aster House | <http://127.0.0.1:4343> |

The internal BlockDemo is at <http://127.0.0.1:4318>. Select a template and a
category or block to inspect its examples. Full-page compositions and state
fixtures belong to this internal review site; they are not customer starter data.

The examples remain running from the delivery worktree. If an owned candidate
preview has stopped, run the corresponding command from
`/Users/worsin/.codex/worktrees/convexpress-hardening`:

```sh
node output/final-candidate-20261007/start-example.mjs core
node output/final-candidate-20261007/start-example.mjs journal
node output/final-candidate-20261007/start-example.mjs depot
node output/final-candidate-20261007/start-example.mjs aster-house
```

Each command runs one preview in the foreground with a strict port. Run only the
stopped preview, in its own terminal. The runners retain each site's identity and
use the tested client/server Website artifact. Original previews on4325–4328 and the prior candidate previews on4335–4338
remain separate, preserved processes.

## Author and customize

Use the existing native ConvexPress Admin window. For a fresh development launch
after closing your own previous instance:

```sh
cd /Users/worsin/.codex/worktrees/convexpress-hardening/ConvexPress-Admin
CONVEXPRESS_DESKTOP_DEV_URL=http://127.0.0.1:4105 bun run dev:native
```

The existing acceptance window also depends on the Worker SOCKS tunnel at
`127.0.0.1:17890`; it was restored after a missing listener prevented login. Keep
that tunnel running while using that window. This is specific to its launch configuration.

This command reuses the existing renderer on4105 and opens the actual Electron
app. If the renderer is also stopped, omit `CONVEXPRESS_DESKTOP_DEV_URL` so the
development launcher starts it. The public Website addresses above are for
viewing site content; authoring remains in the native application.

Confirm the website and environment
in its switcher, then open Pages. The complete short workflow is
[Author a page and change its template](../block-kit/AUTHORING.md): insertion,
nesting, fields, Save changes, publication review, Customize drafts, conflicts
and recovery.

The template changes presentation while the page retains its authored blocks,
media and resource references. In Journal and Depot, Feature Grid now offers
Default, Cards and Minimal; Testimonials offers Default, Editorial and Wall.
Switching to a pack that does not implement a saved style uses its default
presentation and preserves the saved choice. The editor identifies that fallback.

Pages, templates and plugins are scoped to the selected site environment. A
pattern inserts independently editable blocks. Synced content follows its
selected revision policy. Autosave and recovery do not themselves publish;
saving an already published page can change its public output.

## Develop a block, template or extension

| Work | Entry point |
| --- | --- |
| Build, extend, style, compose or promote a block | [Block workflow](../block-kit/WORKFLOW.md) and [contract](../block-kit/CONTRACT.md) |
| Reusable starting layouts | [Pattern skill](../.codex/skills/pattern-build/SKILL.md) |
| Token-first template and additional surfaces | [Template kit](../ConvexPress-Website/template-kit/README.md) |
| Backend/Admin/Website/Dashboard feature | [Extension workflow](../ConvexPress-Admin/extension-kit/WORKFLOW.md) |

Canonical block specifications live at repository root. After changing a
contract, run `bun run sync:blocks:all`, review the generated diff, then run
`bun run sync:blocks:all --check`. Pack-only presentation belongs in that pack's
owned renderer/tokens/styles. Follow the relevant kit for its additional checks.
Source generation does not deploy or activate a template or extension.

## Evidence and remaining work

The authoritative scope and status remain the
[delivery plan](superpowers/plans/2026-09-28-editor-template-delivery.md) and
[status inventory](superpowers/plans/2026-09-28-editor-template-status.json).
Acceptance reports distinguish tested behavior from provider configuration and
from signed/self-contained distribution.

| Area | Evidence |
| --- | --- |
| Actual native authoring, conflict and recovery | [Native candidate](../ConvexPress-Admin/audits/2026-09-04/candidate-native-20261006.md) |
| Production native history restore and receiver recovery | [Preview recovery](../ConvexPress-Admin/audits/2026-09-04/preview-history-fixed-20261006.md) |
| Production native assembly and preview | [Artifact acceptance](../ConvexPress-Admin/audits/2026-09-04/delivery-artifacts-20261006.md) |
| Four authored sites, data preservation and public actions | [Example candidates](../ConvexPress-Admin/audits/2026-09-04/example-candidate-20261006.md) |
| New collection styles and fallback | [E107](../ConvexPress-Admin/audits/2026-09-04/collection-styles-20261006.md) |
| E107 installed metadata, refreshed artifacts and local integration | [Installed E107](../ConvexPress-Admin/audits/2026-09-04/e107-installed-20261006.md) |
| All137 blocks across four desktop packs | [Tracker evidence](../ConvexPress-Admin/audits/2026-09-04/tracker-evidence-final-20261006.md) |
| Installed nested-list consumer compatibility | [Six consumers](../ConvexPress-Admin/audits/2026-09-04/nested-consumers-20261007.md) |
| Presentation/state map and motion acceptance | [Task6 reconciliation](../ConvexPress-Admin/audits/2026-09-04/task6-state-motion-20261007.md) |
| Demo navigation and complete mobile patterns | [BlockDemo review](../ConvexPress-Admin/audits/2026-09-04/demo-visible-review-20261006.md) |
| Script Embed Vimeo and refreshed packaged-native save/reload | [Current provider/native acceptance](../ConvexPress-Admin/audits/2026-09-04/script-vimeo-final-20261007.md) |
| Current installed sources, artifacts and remaining gates | [Current candidate](../ConvexPress-Admin/audits/2026-09-04/final-candidate-20261007.md) |
| SDK workflows and cleanup | [Kit workflows](../ConvexPress-Admin/audits/2026-09-04/kit-workflow-refresh-20261006.md) |

The three obsolete live post columns are now removed across all six sites.
All 203 original posts, 927 revisions and 81 stored files were preserved; native
save/history/reload and actual Website output passed. See
[installed schema retirement](../ConvexPress-Admin/audits/2026-09-04/schema-retirement-installed-20261007.md).

Assistant cart requests prepare a labeled product/option and quantity in the conversation.
The shopper selects its Add button to change the cart. Asking a question or generating
an answer cannot add items; retrying the same button cannot repeat an accepted addition.
The action is unavailable after the conversation is cleared. Specific variants retain
their option label and use current cart pricing and stock checks when added. See
[Assistant cart authority](../ConvexPress-Admin/audits/2026-09-04/assistant-cart-authority-20261007.md).

Actual AI generation, selected-resource composition/style/SDK workflows and Assistant
Band are accepted. The remaining block requirement is authorized Instagram success for Social Feed.
Event RSVP now passes actual real Turnstile registration, reload and cancellation
for original and generated providers; see [RSVP acceptance](../ConvexPress-Admin/audits/2026-09-04/rsvp-provider-final-20261007.md). Public HTTPS editing
still needs a working authorized target: the registered Aster House staging backend
is currently disabled by Convex for exceeding free-plan limits. Restore that deployment
or use another authorized staging environment. The requirement map is current; final acceptance remains open; no real checkout or booking is implied by an example site.

The current native artifact is a local acceptance assembly with external local
dependencies, not a signed installer. Existing unrelated whole-application audit
items remain outside this delivery unless they reproduce as a necessary blocker.

The current [requirement map](../ConvexPress-Admin/audits/2026-09-04/delivery-requirements-20261007.md) records completed [legacy theme/layout retirement](../ConvexPress-Admin/audits/2026-09-04/theme-retirement-20261007.md). Instagram and public HTTPS acceptance retain their external prerequisites. The unused localhost-only RSVP Cloudflare widget remains recorded for provider-side removal; its backend secret and temporary policy have already been removed/restored.
