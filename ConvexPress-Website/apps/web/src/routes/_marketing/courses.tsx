import { Outlet, createFileRoute } from "@tanstack/react-router";

import { PublicPluginGate } from "@/components/plugins/PublicPluginGate";

export const Route = createFileRoute("/_marketing/courses")({
  component: CoursesLayout,
});

function CoursesLayout() {
  return (
    <PublicPluginGate pluginId="lms">
      <Outlet />
    </PublicPluginGate>
  );
}
