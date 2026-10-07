# Site-name bootstrap escaping — 2026-10-05

Claude audit32 D2 accepted after current-source verification. The root document serialized the configurable site name directly into an inline script. JSON string quoting alone does not protect HTML script boundaries.

The root now renders a small SiteNameBootstrap component using the same less-than escaping as the adjacent runtime bootstrap. The existing site-name resolution and client global are unchanged. The actual component is server-rendered and parsed/executed in JSDOM: a mixed-case closing script previously created a second script, while the fixed output creates exactly one script, no injected image or probe execution, and preserves the resolved title including quotes, ampersands and internal Unicode separators. Ordinary names are also covered.

Three bootstrap cases plus the isolated breadcrumb SSR wrapper pass (4 outer tests,13 assertions); Website TypeScript and scoped lint pass. This is source/SSR acceptance, not a claim of publishing malicious settings to a live site or deploying the fix. No settings, runtime or backend writes. Full editor/template delivery remains open.
