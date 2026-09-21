import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/_admin/appearance/footer")({
  beforeLoad: () => { throw redirect({ to: "/appearance/customize", replace: true }); },
});
