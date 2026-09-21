# Opaque media authoring inventory — 2026-09-05

This is a schema/producer checkpoint, not an exhaustive inventory of arbitrary plugin encodings. The owner set is explicit in convex/media/referenceOwners.ts. For every selected owner the offline generator derives **every root field containing a string or any validator**, including nested object/array strings, from the actual schema. These exact generated roots are shared by deletion scanning and attachment writer validation. A checked-in test re-derives each root set from schema; check:media-references rejects artifact drift. No private payload values appear below.

| Owner | Generated opaque roots | Guarded current producer / boundary |
|---|---|---|
| appearance_drafts | `packId`, `sourceRevision`, `values`, `variants` | settings.templateDrafts save |
| commerce_product_categories | `description`, `icon`, `metaDescription`, `metaTitle`, `name`, `slug` | commerce category create/update, WP upserts, promotion shared.write/rollback |
| commerce_product_variants | `description`, `globalUniqueId`, `optionSummary`, `price`, `salePrice`, `selectionKey`, `selections`, `shippingHeightIn`, `shippingLengthIn`, `shippingWidthIn`, `sku`, `taxClass`, `title`, `weight` | commerce variant create/update, WP upserts, promotion shared.write/rollback |
| commerce_products | `assistantSummary`, `basePrice`, `conversationalAttributes`, `defaultAttributes`, `description`, `excerpt`, `optionTypes`, `productAttributes`, `rawSourceMeta`, `salePrice`, `searchText`, `sku`, `slug`, `taxClass`, `title` | commerce product create/update, WP upserts, demoSeed shops, promotion shared.write/rollback; fixed bundle creation has no media attachments |
| fieldDefinitions | `conditionalLogic`, `defaultValue`, `instructions`, `key`, `label`, `name`, `settings`, `type`, `wrapperClass`, `wrapperId`, `wrapperWidth` | customFields create/edit/duplicate/import; forms clone/import/dev fixtures |
| fieldValues | `entityId`, `entityType`, `fieldKey`, `fieldName`, `updatedBy`, `value` | customFields single/bulk setters; forms submission/admin edit/upsert paths |
| kb_articleVersions | `changeSummary`, `content`, `title` | KB version save/restore writer paths |
| kb_articles | `content`, `contentPlainText`, `excerpt`, `keywords`, `metaDescription`, `metaTitle`, `slug`, `title` | KB create/update/autosave/workflow and internal writer paths |
| kb_templates | `content`, `description`, `name`, `slug` | KB template create/update and defaults |
| layouts | `config`, `description`, `name`, `slug` | No active layout writer module found; legacy stored config is scanned; raw/import boundary remains |
| lms_certificates | `templateDoc`, `title` | certificate create/update, seed inserts |
| lms_courses | `categoryIds`, `completionRedirectUrl`, `descriptionDoc`, `excerpt`, `externalButtonUrl`, `materialsDoc`, `promoVideoUrl`, `slug`, `tagIds`, `title` | LMS create/update/duplicate, AI, seed inserts; promotion shared.write/rollback |
| lms_lessonVersions | `bodyDoc`, `snapshotJson` | LMS lesson save, AI/restorable snapshot inserts |
| lms_nodes | `bodyDoc`, `description`, `materialsDoc`, `title`, `transcriptText`, `videoProvider`, `videoUrl` | LMS node/lesson/AI create/update/restore/duplicate, seed inserts; promotion shared.write/rollback |
| postMeta | `key`, `value` | post mutation single/bulk/copy, custom-field dual writes, WP import, SEO/publication schedule metadata writers |
| posts | `autosaveContent`, `autosaveTitle`, `blocks`, `content`, `excerpt`, `hero`, `layoutId`, `pagePrompt`, `pageSections`, `pageTemplate`, `password`, `path`, `previousStatus`, `slug`, `sources`, `summary`, `tableOfContents`, `title`, `topics`, `wpGuid` | posts/pages mutations + HTTP/internal paths, legacy blocks save, dashboard quick draft, WP upserts, promotion shared.write/rollback |
| recipes | `description`, `excerpt`, `ingredients`, `instructions`, `notes`, `nutrition`, `scannedText`, `servings`, `slug`, `title`, `yieldText` | recipe create/update/clone/publish metadata writers |
| reusableBlocks | `blockType`, `category`, `content`, `description`, `slug`, `title` | editor mutations create/update/duplicate and editor internals |
| revisions | `authorId`, `blocks`, `changedFields`, `content`, `excerpt`, `hero`, `pageSections`, `pageTemplate`, `sources`, `summary`, `tableOfContents`, `title`, `topics` | revisions create/autosave/restore, post/page automatic snapshots |
| settings | `values` | settings update/import/template publish/appearance migration/legacy secret upgrade; promotion shared.write/rollback |
| themes | `colorPalette`, `description`, `footerConfig`, `headerConfig`, `layoutAssignments`, `name`, `slug`, `thumbnail` | demoSeed shops helper; no active legacy theme-builder writer module found; raw/import boundary remains |

Typed media-ID fields are generated separately for all schema tables, including future extension tables after regeneration. A new opaque owner still requires a producer audit and explicit admission to the owner set. The generator does not mistake every operational/audit/payment payload for live authoring.

Read-only JSON decoding catches serialized TipTap/legacy JSON and escaped media identifiers. Non-JSON strings are checked for literal target IDs; unknown base64/encrypted/custom binary encodings and URL-only embeds are not decoded. The corresponding writer guard uses actual db.normalizeId(media, value), not a 32-character-shape-only validity test. Matching opaque references are retained and force-clear is refused; no guessed JSON/HTML rewriting occurs. String roots such as labels/SEO descriptions are conservatively included, so an exact literal media ID in prose can retain the item.

Raw snapshot replaceAll and administrative direct writes bypass application wrappers. Fixed seed/counter-only paths without supplied media IDs are not claimed as a generalized writer adapter; dynamic two-argument/dynamic-table writers must be reviewed before reverse-index completeness is asserted. Promotion rollback explicitly validates restored references before applying backups. Existing historical drafts/revisions can pin media until a separate retention/clear policy is designed.

Storage ownership is a distinct check: primary media blobs, mediaSizes and exact mediaMeta.value edit-backup IDs are protected by indexed reads. Arbitrary external tables storing encoded storage URLs/IDs are not claimed covered. A maintained media/reverse-storage reference model with writer and raw-restore completeness gates remains required before scalable absence decisions.
