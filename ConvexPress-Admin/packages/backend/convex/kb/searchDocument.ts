import type { Doc } from "../_generated/dataModel";
import { canonicalJson, sha256Hex } from "../canonicalDocuments/foundation/shared/fingerprints";

export type SearchArticle = Doc<"kb_articles"> & { categorySlug: string | null; tags: string[] };
export function meilisearchDocument(article: SearchArticle) {
  return {
    id: article._id, title: article.title, slug: article.slug,
    excerpt: article.excerpt ?? "", contentPlainText: article.contentPlainText ?? "",
    categorySlug: article.categorySlug, tags: [...article.tags].sort(), status: article.status,
    publishedAt: article.publishedAt ?? null,
  };
}
export function searchDocumentFingerprint(article: SearchArticle) {
  return sha256Hex(canonicalJson(meilisearchDocument(article)));
}

export function meilisearchConfigFingerprint(settings: Record<string, unknown> | null) {
  return sha256Hex(canonicalJson({ enabled: settings?.meilisearchEnabled === true, url: settings?.meilisearchUrl ?? "", key: settings?.meilisearchApiKey ?? "" }));
}
