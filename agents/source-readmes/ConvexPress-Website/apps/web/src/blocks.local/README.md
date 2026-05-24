# ConvexPress Website Local Blocks

Local block renderers live here and mirror the admin-side local block folder.
Each renderer exports a `WebsiteBlockDefinition` from `manifest.tsx`.

`sample-alert/` mirrors the admin sample block and exists only as a proof of
the scanner-based extension path. Production sites can keep it, disable it, or
replace it with site-specific local blocks without patching core files.
