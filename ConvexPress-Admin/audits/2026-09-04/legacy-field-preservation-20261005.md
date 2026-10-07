# Retained legacy fields and canonical promotion review — October 5

## Preservation decision

Keep historical source and revision fields in storage. Removing optional validators now would invalidate preserved records or require destructive rewriting. This is an explicit preservation boundary, not an alternate current editor.

- `contentMode`, `content`, `pageSections`, `hero`, `topics`, `summary`, `sources`, `tableOfContents`, old block shapes and legacy autosave values are consumed by deliberate import/recovery in canonicalDocuments/service.ts and authoringSnapshot.ts. AUTHORING_FIELDS binds exact revision snapshots and digests; deleting these fields would weaken recovery.
- Current canonical create/body-save/restore/promotion clears mode and uses blocksVersion2 plus validated trees. Historical mode values remaining on untouched original records do not select the current editor or public renderer.
- publicContent.ts suppresses raw authored body fields for canonical rows. It still projects optional mode metadata for compatibility; current Website route DTOs no longer consume that metadata as dispatch.
- Old structured AI/autosave helpers remain legacy compatibility callers, not canonical writers. media/attachmentGuard.ts routes insert/patch/replace through assertAuthoringWrite; authoringVersionFence.ts protects authoring and publication fields and refuses unpermitted canonical writes. Existing version-fence tests were included in f5280e25 acceptance. This review does not claim those compatibility APIs have been retired.
- Layout, excerpt, featured image, page template and pagePrompt are distinct metadata contracts; a matching historic field name is not sufficient reason to remove them.

The E07 remaining compatibility API retirement must stay explicit. It does not require holding E10 site authoring until historical fields are erased. No original data/schema mutation was made in this follow-up.

## Demonstrated UI dependency and repair

Required workflow: readable promotion review of canonical page/post content exported without legacy mode/raw blocks.
Evidence: PromotionAuthoredContent only detected old mode/raw blocks or article content; rendered regression lacked its Website-preview notice for the canonical transport.
Dependency: canonical exporter intentionally omits mode and raw blocks, leaving blocksVersion2 and canonical transport.
Repair: recognize blocksVersion2 in the existing preview notice condition. Do not render another approximate block preview.
Exit: regression failed on missing notice before the change; all19 promotion component tests/116 assertions now pass, including escaping, malformed review, expiry, confirmation and uncertain-response cases. No backend redeployment or data changes required. Native integrated Website preview remains a separate open acceptance item.

## Next delivery work

Proceed to Task6/E10 safe canonical example-site provisioning. The retired destructive marketing seed remains retired. Existing packs each contain eight pattern files; file count alone is not finished site acceptance. Four authored route/navigation/media sets and real desktop/mobile review remain required.
