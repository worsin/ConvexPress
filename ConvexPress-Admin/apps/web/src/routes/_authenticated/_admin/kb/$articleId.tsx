import { createFileRoute, redirect, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/_admin/kb/$articleId")({
  component: KBArticleDetailLayout,
  beforeLoad: ({ location, params }) => {
    const path = location.pathname;
    const base = `/kb/${params.articleId}`;
    if (path === base || path === `${base}/`) {
      throw redirect({ to: "/kb/$articleId/edit", params: { articleId: params.articleId } });
    }
  },
});

function KBArticleDetailLayout() {
  return <Outlet />;
}
