import { Outlet, createFileRoute } from "@tanstack/react-router";

import { LmsRoutePending } from "@/components/lms/LmsRoutePending";
import { PublicPluginGate } from "@/components/plugins/PublicPluginGate";

export const Route = createFileRoute("/_marketing/courses")({
  component: CoursesLayout,
});

function CoursesLayout() {
  return (
    <PublicPluginGate
      pluginId="lms"
      pendingFallback={<LmsRoutePending label="Loading learning area" />}
    >
      <Outlet />
    </PublicPluginGate>
  );
}
