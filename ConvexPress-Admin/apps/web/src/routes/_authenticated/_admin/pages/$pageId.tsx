/**
 * Page Detail Layout Route - /admin/pages/$pageId
 *
 * Layout route that wraps all page detail child routes (edit, seo, traffic, engagement, revisions).
 * Renders the PostDetailLayout with tabbed navigation.
 */

import { createFileRoute, redirect } from "@tanstack/react-router";
import { PostDetailLayout } from "@/components/editor/PostDetailLayout";

export const Route = createFileRoute("/_authenticated/_admin/pages/$pageId")({
  component: PageDetailLayoutRoute,
  beforeLoad: ({ location, params }) => {
    const path = location.pathname;
    const base = `/pages/${params.pageId}`;
    if (path === base || path === `${base}/`) {
      throw redirect({ to: "/pages/$pageId/edit", params: { pageId: params.pageId } });
    }
  },
});

function PageDetailLayoutRoute() {
  return <PostDetailLayout contentType="page" />;
}
