/** Audited producers with opaque authored values. The generator derives ALL root
 * fields containing strings/any from each schema; this list is owner coverage,
 * not a registry of block names, guessed field names, or arbitrary tables.
 * See audits/2026-09-04/media-opaque-authoring-inventory.md for writer boundaries. */
export const opaqueAuthoringOwners = [
  "canonicalDocumentDrafts",
  "posts", "revisions", "postMeta", "reusableBlocks", "syncedBlockRevisions", "blockDefinitionVersions", "fieldValues", "fieldDefinitions",
  "settings", "appearance_drafts", "layouts", "themes", "legacyAppearanceArchives",
  "commerce_products", "commerce_product_variants", "commerce_product_categories",
  "lms_courses", "lms_nodes", "lms_lessonVersions", "lms_certificates",
  "kb_articles", "kb_articleVersions", "kb_templates", "recipes",
] as const;
