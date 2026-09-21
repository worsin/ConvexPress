# Publication-date consistency — September 6

Latest Posts and Post Grid previously forced UTC, showing September 5 while the same articles in the archive showed September 4 in the configured America/Denver timezone. Both renderers now use the same shared formatter and public settings context as the archives. The pure timezone context is separate from the query/client dependency graph and inherits UTC when no host exists. SettingsProvider supplies the live public timezone. Stored publication instants and semantic datetime attributes are unchanged.

An initial prototype added timezone to resolver DTOs; it was reverted before deployment because older open clients use strict response decoders. Backend readers and source/deployed wire schemas were compared byte-for-byte against the prior term-counts checkpoint. This final change is Website-only.

## Verified

- Renderer contract wrapper and host-timezone formatter: 2 entry tests, 11 assertions; new actual-renderer cases cover Denver and Tokyo plus existing UTC cases.
- Website TypeScript, 136-spec/four-pack generation checks and actual-workerd hosting build passed. Hosting covers four packs across home/page/post, private/missing/draft denial and archive routes.
- Electron published staging Website artifact prefix `6c42303c5b73`; native publisher reports succeeded and public pages verified.
- Public Navigation field guide: three Latest Posts dates and one Post Grid date display Sep 4, 2026 in raw SSR and hydrated DOM. Their unchanged ISO instants are Sep 5 UTC. No page errors.
- Journal archive displays two SEP 4, 2026 labels for matching stories. The archive uses styled text, rather than time elements; text verification supersedes the first empty time-selector observation.
- Saved Electron preview acknowledges the current document and shows the same four dates. Closed preview with All changes saved.
- MagicTables A01-A03 Notes/Convex Audit updated with exact readback; unrelated fields preserved.

The first SSR extraction was case-sensitive and missed React dateTime attributes; a corrected case-insensitive raw HTML extraction verifies all four. A separate urllib fetch received HTTP403; browser navigation returned200 and supplied the actual response HTML. The focused mobile screenshot verifies readable dates; it is not a whole-page media or motion acceptance artifact.

Evidence: root output/post-dates-20260906 and output/playwright/post-dates-20260906/latest-posts.png. Production untouched. Overall renderer acceptance remains95/136; broader production goal remains active.
