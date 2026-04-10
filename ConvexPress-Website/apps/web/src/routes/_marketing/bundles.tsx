import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_marketing/bundles")({
  component: BundlesLayout,
});

function BundlesLayout() {
  return <Outlet />;
}
