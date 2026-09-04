/**
 * Continue learning: courses in progress with resume buttons
 * (lms.enrollment.queries.listMyLearning).
 */

import { Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { PlayCircle } from "lucide-react";
import { api } from "@convexpress-website/backend/generated/api";

import { useSettings } from "@/contexts/SettingsContext";
import type { DashboardWidgetModule, DashboardWidgetProps } from "../../contracts";
import { WidgetEmpty, WidgetSkeleton } from "../../grid/WidgetCard";
import { useDashboardShell } from "../../shell/DashboardShellContext";
import { ViewAllLink, rowsForSize } from "../_shared";

interface LearningCourse {
  enrollmentId: string;
  title: string;
  slug: string;
  lessonCount: number;
  completedCount: number;
  percent: number;
  nextNodeId?: string | null;
}

function CoursesWidget({ size }: DashboardWidgetProps) {
  const { to } = useDashboardShell();
  const settings = useSettings();
  const enabled = settings?.plugins?.lmsEnabled !== false;
  const courses = useQuery(api.lms.enrollment.queries.listMyLearning, enabled ? {} : "skip") as
    | LearningCourse[]
    | undefined;
  if (!enabled) return <WidgetEmpty icon="graduation-cap" title="Courses are off" />;
  if (courses === undefined) return <WidgetSkeleton rows={3} />;
  const inProgress = [...courses].sort((a, b) => (a.percent >= 100 ? 1 : 0) - (b.percent >= 100 ? 1 : 0));
  if (inProgress.length === 0) {
    return (
      <WidgetEmpty
        icon="graduation-cap"
        title="No courses yet"
        action={
          <Link to="/courses" className="font-medium text-primary hover:underline">
            Browse courses
          </Link>
        }
      />
    );
  }
  return (
    <ul role="list" className={size === "xl" ? "grid grid-cols-2 gap-x-6" : "divide-y divide-border"}>
      {inProgress.slice(0, rowsForSize(size, 3)).map((course) => {
        const percent = Math.min(100, Math.max(0, course.percent));
        const href = course.nextNodeId ? to(`/courses/${course.slug}/${course.nextNodeId}`) : `/courses/${course.slug}`;
        return (
          <li key={course.enrollmentId} className="flex items-center gap-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-foreground">{course.title}</p>
              <div className="mt-1 flex items-center gap-2">
                <div className="h-1.5 flex-1 bg-muted" aria-hidden="true">
                  <div className="h-full bg-primary" style={{ width: `${percent}%` }} />
                </div>
                <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                  {course.completedCount}/{course.lessonCount}
                </span>
              </div>
            </div>
            <Link
              to={href}
              aria-label={`${percent >= 100 ? "Review" : "Continue"} ${course.title}`}
              className="inline-flex h-7 shrink-0 items-center gap-1 bg-primary px-2 text-[11px] font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
            >
              <PlayCircle className="size-3.5" aria-hidden="true" />
              {percent >= 100 ? "Review" : "Continue"}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function Actions() {
  const { to } = useDashboardShell();
  return <ViewAllLink to={to("/courses")} />;
}

const module: DashboardWidgetModule = {
  id: "courses",
  Widget: CoursesWidget,
  Actions,
};

export default module;
