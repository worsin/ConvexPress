import { createFileRoute, redirect } from "@tanstack/react-router";

/** Preserve bookmarked editor URLs while consolidating appearance controls. */
export const Route = createFileRoute("/_authenticated/_admin/settings/shop-layout")({
  beforeLoad: () => { throw redirect({ to: "/appearance/customize", replace: true }); },
});
