/**
 * Post Detail Layout Route - /admin/posts/$postId
 *
 * Layout route that wraps all post detail child routes (edit, seo, traffic, engagement, revisions).
 * Renders the PostDetailLayout with tabbed navigation.
 */

import { createFileRoute, redirect } from "@tanstack/react-router";
import { PostDetailLayout } from "@/components/editor/PostDetailLayout";

export const Route = createFileRoute("/_authenticated/_admin/posts/$postId")({
  component: PostDetailLayoutRoute,
  beforeLoad: ({ location, params }) => {
    const path = location.pathname;
    const base = `/posts/${params.postId}`;
    if (path === base || path === `${base}/`) {
      throw redirect({ to: "/posts/$postId/edit", params: { postId: params.postId } });
    }
  },
});

function PostDetailLayoutRoute() {
  return <PostDetailLayout contentType="post" />;
}
