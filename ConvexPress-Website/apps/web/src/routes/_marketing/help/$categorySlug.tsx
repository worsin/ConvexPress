import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_marketing/help/$categorySlug")({
  component: CategoryLayout,
});

function CategoryLayout() {
  return <Outlet />;
}
