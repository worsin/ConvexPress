/**
 * Courses page module: enrolled list at "", lesson player at "/<slug>/<nodeId>".
 */
import type { DashboardPageModule } from "../../contracts";
import { NotFoundPage } from "@/components/blog/NotFoundPage";
import { DashboardCoursesPage } from "./CoursesPage";
import { DashboardCoursePlayerPage } from "./CoursePlayerPage";

const module: DashboardPageModule = {
  id: "courses",
  matchSubpath: (subpath) => {
    const parts = subpath.split("/").filter(Boolean);
    return parts.length === 0 || parts.length === 2;
  },
  Page: ({ subpath }) => {
    const parts = subpath.split("/").filter(Boolean);
    if (parts.length === 0) return <DashboardCoursesPage />;
    if (parts.length === 2) return <DashboardCoursePlayerPage slug={parts[0]} nodeId={parts[1]} />;
    return <NotFoundPage />;
  },
};

export default module;
