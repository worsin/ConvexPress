# Navigation and permalink follow-up

## Closed navigation sections

Root's native Electron observation: Media reported `aria-expanded=false` while Library remained exposed as a visible role link and keyboard target. `NavSection` only used height/opacity to collapse the child list.

The list now applies `aria-hidden`, `inert`, hidden visibility, and disabled pointer events when closed, preserving its existing height/opacity animation. If focus was inside when the group closes, it returns to the parent toggle. React `useId` also keeps each desktop/mobile toggle's `aria-controls` association unique.

The mounted React/JSDOM regression failed on the absent hidden state before the fix. It now checks both toggle states, inert/visibility/accessibility attributes, child focus restoration, and the reopened link's original href and click delivery. It does not simulate a full browser accessibility tree or claim native navigation acceptance.

## Editor permalink origin

Root observed `https://example.com/home` in Aster House staging even though the instance and general settings had its real staging address. `EditorLayout` queried `settings.queries.get`, which returns a raw document containing `values`, but read `.siteUrl` from the document's top level. `SlugEditor` replaced the resulting empty value with a hardcoded example origin.

Page and post editors now prefer the selected environment's `siteOrigin`, including when database content came from a production snapshot. Standalone admin use reads the actual document's `values.homeUrl` or `values.siteUrl`. Invalid or temporarily absent selected identity does not fall back to another environment's settings. URL normalization rejects credentials, non-HTTP schemes, paths, queries, and fragments. Missing configuration produces explanatory text and no invented permalink hyperlink. Existing page/post path rules remain intact.

## Validation

Four focused tests passed with 23 assertions. Admin web TypeScript and `git diff --check` passed. Native/browser verification remains with root's existing Electron session; this subtask performed no native/browser interaction, deployment, commit, or push.
