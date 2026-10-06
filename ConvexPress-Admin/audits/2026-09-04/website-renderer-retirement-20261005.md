# Website legacy renderer retirement — October 5, 2026

Task4/E07 continuation after cbc33bb4. The production page/post/home surfaces already use PublicCanonicalBody. Repository source references show the old article/structured/block-list renderers had no remaining production callers: only their own helpers, dedicated tests, an offline compatibility fixture and stale design guidance remained. BlockDemo's original utility comparison calls the registry directly.

## Delivered

Retired nine files: BlockListRenderer and its implementation; BlockContentRenderer, PostContent, StructuredContent; their private ArticleEmbed/LinkifiedText helpers and two dedicated legacy test files. Removed the now-unused article block type family and Website BlockContentMode alias. Retained the source registry/renderers for actual BlockDemo utility comparisons; the production canonical renderer is unchanged.

The offline SSR fixture now tests the real OriginalUtilitiesStudy instead of obsolete full-document dispatch. The single-post design reference and both Codex/Claude design-single-post instructions now target a typed pack-owned canonical surface with membership gate precedence, preserving the route's SSR/SEO/authentication responsibilities. They no longer prescribe deleted PostContent or raw contentHtml rendering.

Shared URL adversarial vectors remain in lib/security/url.test.ts. Canonical rich-text checks explicitly preserve markup as literal text and refuse active/normalized URL escapes. Canonical provider/consent and rendered surface suites remain authoritative for live rendering. Tests for deleted private legacy behavior were retired with that behavior, not represented as current canonical acceptance.

## Evidence

output/website-renderer-retirement-20261005/:

- focused.log:19tests/150assertions pass across real public-body lifecycle, four-pack surface wrapper, primitives, embed provider and shared URL tests.
- renderers.log: centralized canonical renderer regression harness passes. Its child cases include current canonical embeds, interactions and authored content. No new all-block acceptance claim from this wrapper count.
- demo.log:11tests/159assertions pass for existing demo discovery, fixtures, gallery and authoring preview.
- types.log: Website types pass after final old article type removal.
- build.log: production client/server build passes; final subsequent source change only removes unused TypeScript interfaces. No new runtime code was added after this build.
- ssr.log: all four loading/lazy surfaces, authored Aster cover, selective hydration, seven original/canonical utility pairs per pack and12canonical nested/reusable/custom cases pass. The first utility fixture attempt used synchronous markup on lazy canonical renderers and suspended; corrected to the real streaming SSR/Suspense path and reran successfully.
- source-before.json / preservation.json:9retired files recorded;134existing registry/renderer/demo/portable files byte-identical. The one intentional lib/blocks/types.ts change removes an unused mode alias and updates its child-slot comment.

The first repository-root Bun invocation hit EMFILE before loading tests. Running from the Website app with a bounded file set succeeded; this was not a renderer failure. No site data writes, deployment, new native/browser acceptance session, or process cleanup needed. Prior live page/post evidence remains scoped to cbc33bb4; this batch establishes unreachable-code retirement and surviving caller coverage.

## Next boundary

Backend foundation documentState.ts still requires contentMode=blocks in current edit, restore and publication validation, in addition to blocksVersion2. service.ts writes that field and promotion envelopes require it. Legacy import uses article/blocks to interpret historical data. Distinguish redundant current-document identity from retained historical decoding before changing schema/data. Installed deployment bases remain output/generic-update-retirement-20261005/{source,target}-source-installed.json. E07 and full delivery remain open;117Verified/20In progress unchanged. No push.
