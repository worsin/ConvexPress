/**
 * My Learning — /lms/my-courses (the current user's enrolled courses)
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex-helpers/react/cache";
import { api } from "@backend/convex/_generated/api";
import { GraduationCap, BookOpen } from "lucide-react";

export const Route = createFileRoute("/_authenticated/_admin/lms/my-courses")({
  component: MyCoursesPage,
});

function MyCoursesPage() {
  const rows = useQuery(api.lms.enrollment.queries.listMyEnrollments, {}) as
    | Array<{ courseId: string; title: string; slug: string; lessonCount: number }>
    | undefined;

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-6 flex items-center gap-3">
        <GraduationCap className="h-6 w-6" />
        <h1 className="text-2xl font-semibold">My Learning</h1>
      </div>

      {rows === undefined ? (
        <div className="py-16 text-center text-sm text-muted-foreground">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
          You're not enrolled in any courses yet.{" "}
          <Link to="/lms/catalog" className="text-primary hover:underline">
            Browse the catalog
          </Link>
          .
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((r) => (
            <Link
              key={r.courseId}
              to="/lms/learn/$courseId"
              params={{ courseId: r.courseId }}
              className="rounded-lg border border-border p-5 transition hover:border-primary hover:shadow-sm"
            >
              <BookOpen className="mb-3 h-6 w-6 text-muted-foreground" />
              <div className="font-medium">{r.title}</div>
              <div className="mt-3 text-xs text-muted-foreground">
                {r.lessonCount} lessons — Continue →
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
