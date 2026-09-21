# Troubleshooting

- **Missing in canonical catalog:** inspect root discovery name/path ownership and spec validation. Run `sync:blocks:all` and `check:blocks`. Do not patch old `CoreBlockName` unions or app manifests.
- **Renderer absent:** inspect the adjacent `render.tsx`, its `defineBlock` name, lazy discovery and template-owned renderer mapping. A spec alone is not a renderer.
- **New attrs fail:** check generated drift, semantic constraints and the saved version. Review migration requirements instead of coercing values or dropping unknown content.
- **Dynamic block unavailable:** trace the typed resolver, active plugin/capability, current site/viewer grant and public DTO. Empty or denied data must remain honest.
- **Edits conflict:** reload the authorized canonical document and reconcile against its revision. Do not retry with a guessed revision.
- **Pack style missing:** inspect declared treatment and owned renderer support versus SDK baseline. Adding a manifest key without the actual renderer is not coverage.
- **Scaffold command fails midway:** inspect the new folder and repair explicitly. The command refuses to overwrite it on retry; it does not delete partial content.
