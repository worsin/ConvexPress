/**
 * usePostSeo - Hook for reading per-post SEO metadata.
 *
 * Wraps useQuery(api.seo.queries.getPostSeo) for the editor metabox.
 */

import { useQuery } from "convex-helpers/react/cache";
import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";

/**
 * Fetch SEO metadata for a specific post.
 * Returns null while loading, empty PostSeoData if post has no SEO metadata.
 */
export function usePostSeo(postId: Id<"posts"> | undefined) {
  return useQuery(
    api.seo.queries.getPostSeo,
    postId ? { postId } : "skip",
  );
}
