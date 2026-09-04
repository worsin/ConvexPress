/**
 * My Courses loader: LMS plugin gate + lms.enrollment.queries.listMyLearning,
 * handed to the `dashboard.courses` surface. Links are built from the
 * configured dashboard base path.
 */
import { api } from "@convexpress-website/backend/generated/api";
import { useQuery } from "convex/react";
import { useMemo } from "react";

import { PublicPluginGate } from "@/components/plugins/PublicPluginGate";
import { useDashboardPath } from "@/hooks/useDashboardConfig";
import CoreDashboardCourses, {
  type DashboardCoursesSurfaceData,
  type DashboardLearningCourse,
} from "@/templates/packs/core/surfaces/dashboard.courses";
import { Surface } from "@/templates/sdk/Surface";

function useCourseHrefs(): DashboardCoursesSurfaceData["hrefs"] {
  const { to } = useDashboardPath();
  return useMemo(
    () => ({
      catalog: "/courses",
      course: (slug: string) => `/courses/${encodeURIComponent(slug)}`,
      lesson: (slug: string, nodeId: string) => to(`/courses/${encodeURIComponent(slug)}/${encodeURIComponent(nodeId)}`),
      certificate: (serial: string) => `/certificates/${encodeURIComponent(serial)}`,
    }),
    [to],
  );
}

export function DashboardCoursesPage() {
  const hrefs = useCourseHrefs();
  return (
    <PublicPluginGate
      pluginId="lms"
      pendingFallback={<Surface name="dashboard.courses" data={{ courses: undefined, hrefs }} fallback={CoreDashboardCourses} />}
    >
      <DashboardCoursesContent hrefs={hrefs} />
    </PublicPluginGate>
  );
}

function DashboardCoursesContent({ hrefs }: { hrefs: DashboardCoursesSurfaceData["hrefs"] }) {
  const courses = useQuery((api as any).lms.enrollment.queries.listMyLearning, {}) as
    | DashboardLearningCourse[]
    | undefined;

  const data: DashboardCoursesSurfaceData = { courses, hrefs };
  return <Surface name="dashboard.courses" data={data} fallback={CoreDashboardCourses} />;
}
