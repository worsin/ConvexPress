import { createFileRoute, redirect } from "@tanstack/react-router";

/** Saved links to the retired editor lead to the active template tools. */
export const Route = createFileRoute("/_authenticated/_admin/appearance/colors")({
  beforeLoad: () => { throw redirect({ to: "/appearance/customize", replace: true }); },
});
