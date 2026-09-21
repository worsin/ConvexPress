# Installed canonical references

Read actual current files rather than copying the former split-schema snippets. Paths below are relative to repository root.

| Concern | Working source |
|---|---|
| Small static block | `blocks/core/cta-band/block.json` and `render.tsx` |
| Rich inline content and anchors | `blocks/core/heading/` |
| Field/treatment controls | `blocks/reference/field-guide/` |
| Plugin-gated dynamic data | `blocks/events/upcoming/` and canonical event resolver/host |
| Configurable commerce with host actions | `blocks/commerce/bundle-offer/`, Website SDK `bundle-*`, backend canonical bundle resolver |
| Layout and nested content | `blocks/core/section/`, `blocks/core/columns/` |
| Pack-owned treatment | Website `src/templates/packs/journal/blocks/core/cta-band.tsx` and `template.json` |
| Portable starter pattern | Website `src/templates/packs/*/patterns/*.json`, validated by `scripts/blocks/patterns.mjs` |

The new files in `../scaffold/` are executable starting templates consumed by `create:block`. Historical `*.example.*` snippets beside this file describe the retired manifest model and must not be used for new canonical blocks.

Runtime creation and styling: [style-and-compose.md](style-and-compose.md). Legacy conversion, commit and recovery boundaries: [content-migration.md](content-migration.md).
