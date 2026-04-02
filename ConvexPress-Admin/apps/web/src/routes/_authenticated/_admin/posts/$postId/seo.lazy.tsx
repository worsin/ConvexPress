/**
 * Post SEO Tab - Lazy-loaded component
 *
 * Renders the SeoDashboardTab using data from the PostDetailLayout context.
 */

import { createLazyFileRoute } from "@tanstack/react-router";
import { SeoDashboardTab } from "@/components/seo/SeoDashboardTab";
import { usePostDetailContext } from "@/components/editor/PostDetailLayout";

export const Route = createLazyFileRoute(
  "/_authenticated/_admin/posts/$postId/seo",
)({
  component: PostSeoTab,
});

function PostSeoTab() {
  const { contentType, postId, post, postSeo } = usePostDetailContext();

  return (
    <SeoDashboardTab
      contentType={contentType}
      postId={postId}
      post={post}
      postSeo={postSeo}
    />
  );
}
