import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/account/courses")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard/courses", replace: true });
  },
});
