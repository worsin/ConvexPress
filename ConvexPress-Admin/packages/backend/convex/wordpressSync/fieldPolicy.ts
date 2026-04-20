/**
 * WordPress import field policy.
 *
 * First-class fields belong in ConvexPress tables. Source-specific details are
 * preserved only when they are needed to render imported content, preserve SEO,
 * or audit commerce history later.
 */

const WP_META_KEY_PREFIXES_TO_PRESERVE = [
  "_elementor_",
  "_yoast_wpseo_",
  "_aioseo_",
  "_rank_math_",
  "acf_",
  "_acf_",
];

const WP_META_KEYS_TO_PRESERVE = new Set([
  "_wp_page_template",
  "_wp_content_rendered",
  "_thumbnail_id",
]);

const WP_META_KEYS_TO_DROP = new Set([
  "_edit_lock",
  "_edit_last",
  "_wp_old_slug",
  "_wp_trash_meta_status",
  "_wp_trash_meta_time",
]);

export interface SourceMetaItem {
  key: string;
  value: unknown;
}

export function shouldPreserveWpPostMetaKey(key: string): boolean {
  if (!key || WP_META_KEYS_TO_DROP.has(key)) return false;
  if (WP_META_KEYS_TO_PRESERVE.has(key)) return true;
  return WP_META_KEY_PREFIXES_TO_PRESERVE.some((prefix) => key.startsWith(prefix));
}

export function serializeSourceMetaValue(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

export function selectWpPostMetaForPreservation(
  metaItems: SourceMetaItem[],
  excludeKeys: Iterable<string> = [],
): Array<{ key: string; value: string }> {
  const excluded = new Set(excludeKeys);
  const selected: Array<{ key: string; value: string }> = [];

  for (const item of metaItems) {
    if (excluded.has(item.key) || !shouldPreserveWpPostMetaKey(item.key)) continue;
    selected.push({ key: item.key, value: serializeSourceMetaValue(item.value) });
  }

  return selected;
}
