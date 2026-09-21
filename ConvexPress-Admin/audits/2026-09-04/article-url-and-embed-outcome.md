# September 5 — article URL, embed and migration safety

This continuation builds on the verified Field Guide/text repair. All edits remain in the isolated hardening worktree; no deployment or provider write occurred.

## Implemented behavior

StructuredContent CTA destinations now use the existing website sanitizeHref policy. Unsafe destinations render their authored label as text rather than a working link. HTTP(S) classification is case-insensitive and external new windows keep noopener/noreferrer. The shared URL helper now rejects embedded controls and backslashes before relative-path classification, preventing browser URL normalization from changing the accepted destination category.

StructuredContent video sections and BlockContentRenderer embeds share ArticleEmbed. Exact reviewed YouTube/Vimeo URLs use the canonical ConsentEmbed component; the generic block entry also supports the existing reviewed map/scheduler adapters. No iframe or external request occurs before the visitor loads it. The fixed provider adapter supplies the source, sandbox and limited permissions. Unknown valid HTTP(S) resources remain ordinary protected links; unsupported/unsafe schemes do not become frames or links. This intentionally removes arbitrary automatic iframe execution while retaining safe access to authored external resources. Twitter and other unreviewed providers are links, not interactive embed implementations.

BlockContentRenderer's inline link marks, buttons, image links and raw image/gallery fallbacks also use the shared href/image policies. Rejected link marks preserve text, rejected button destinations preserve labels, and rejected image sources cannot create a request. Existing media-ID rendering is unchanged. Author rel values can no longer remove new-window protection.

The staged structured converter now matches the safe literal React text grammar: HTML-looking strings, entities and quotes in HTTP URLs remain literal authored text and link attributes. Exact original source stays retained. The closed compatibility generator bundles the actual website sanitizeHref/isExternalUrl helpers, with source hashes and deterministic checks; no independent copied URL policy was invented. CTA conversion follows those helpers, including trimmed/case-insensitive HTTP(S) and explicit cta-label presentation requirements for rejected links.

## Verification

- Article renderer/text/provider suite: 11 tests, 88 assertions passed. These render the real StructuredContent and BlockContentRenderer components, not just helper output.
- Compatibility/schema/legacy-block/structured conversion: 10 tests, 1,683 assertions passed.
- Website, backend Convex graph, and staged canonical foundation type checks passed.
- 54-schema compatibility artifact generated; 28-file deployed foundation regenerated and parity checked. Pure structured conversion is still staged and inactive.
- Actual Chromium interaction with StructuredContent: zero frames/provider requests before activation; one fixed YouTube no-cookie source loaded using an isolated transport response; sandbox/allow values read back; unload removed the frame and returned keyboard focus. Malicious HTML remained text and unsafe CTA produced no link. Provider playback was not tested by this isolated response.
- Mobile screenshot inspected: output/playwright/article-security/mobile.png. Browser receipt: output/playwright/article-security/browser.txt. The first module import triggered a Vite dependency reload; rerunning after the page settled passed. Browser session closed afterward.
- Scoped diff whitespace checks passed. Production website build passed (bun run build); log: /tmp/convexpress-article-security-build.log. The local dist output now contains these changes, but packaged provider resources and live sites have not been republished.

## Still required

No native/client publication or live provider acceptance is claimed. Structured article presentation treatments, reviewed embed migration semantics, lock/edit authority integration, native migration activation and original revision recovery remain open. The renderer acceptance count remains 87/136. This batch does not claim complete article security outside the explicitly tested surfaces or finished third-party provider coverage.
