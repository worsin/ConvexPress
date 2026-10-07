# Editor and template delivery

This is the working delivery entry point, not a declaration that every acceptance
gate is complete. The block tracker currently has 133 Verified rows and four
provider-dependent rows still In progress. Source candidate `cd587c50` includes
the Journal/Depot collection styles, preview receiver recovery and reserved media-route policy.

## Open the examples

These four local candidate previews use separate site databases and authored
content. They are fictional demonstration businesses.

| Template | Website | Open |
| --- | --- | --- |
| Core | Fieldwork Studio | <http://127.0.0.1:4335> |
| Journal | Slow Current | <http://127.0.0.1:4336> |
| Depot | Common Supply | <http://127.0.0.1:4337> |
| Aster House | Aster House | <http://127.0.0.1:4338> |

The internal BlockDemo is at <http://127.0.0.1:4318>. Select a template and a
category or block to inspect its examples. Full-page compositions and state
fixtures belong to this internal review site; they are not customer starter data.

The examples remain running from the delivery worktree. If an owned candidate
preview has stopped, run the corresponding command from
`/Users/worsin/.codex/worktrees/convexpress-hardening`:

```sh
node output/preview-history-fixed-20261006/start-preview.mjs core
node output/preview-history-fixed-20261006/start-preview.mjs journal
node output/preview-history-fixed-20261006/start-preview.mjs depot
node output/preview-history-fixed-20261006/start-preview.mjs aster-house
```

Each command runs one preview in the foreground with a strict port. Run only the
stopped preview, in its own terminal. The runners retain each site's identity and
use the tested client/server Website artifact. Original previews on4325–4328
are separate processes.

## Author and customize

Use the existing native ConvexPress Admin window. For a fresh development launch
after closing your own previous instance:

```sh
cd /Users/worsin/.codex/worktrees/convexpress-hardening/ConvexPress-Admin
CONVEXPRESS_DESKTOP_DEV_URL=http://127.0.0.1:4105 bun run dev:native
```

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
| SDK workflows and cleanup | [Kit workflows](../ConvexPress-Admin/audits/2026-09-04/kit-workflow-refresh-20261006.md) |

The remaining provider requirements are actual AI generation/Assistant Band,
authorized Instagram data for Social Feed, human Turnstile completion for Event
RSVP, and the Vimeo refusal affecting Script Embed. Public HTTPS/local-network
editing still needs an authorized public staging host. Presentation/state evidence is mapped for all 137 blocks and the motion
implementation gate is accepted. The four actual provider interactions and
final integrated acceptance remain open; desktop images do not prove them. No real checkout or booking is
implied by an example site.

The current native artifact is a local acceptance assembly with external local
dependencies, not a signed installer. Existing unrelated whole-application audit
items remain outside this delivery unless they reproduce as a necessary blocker.
