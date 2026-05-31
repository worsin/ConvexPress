/**
 * Course Catalog (learner discovery) — /lms/catalog
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex-helpers/react/cache";
import { api } from "@backend/convex/_generated/api";
import { BookOpen, GraduationCap } from "lucide-react";

export const Route = createFileRoute("/_authenticated/_admin/lms/catalog")({
  component: CatalogPage,
});

function CatalogPage() {
  const courses = useQuery(api.lms.courses.queries.listPublished, {}) as
    | Array<{ _id: string; title: string; slug: string; excerpt?: string; lessonCount?: number }>
    | undefined;

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-2 flex items-center gap-3">
        <GraduationCap className="h-6 w-6" />
        <h1 className="text-2xl font-semibold">Course Catalog</h1>
      </div>
      <p className="mb-6 text-sm text-muted-foreground">
        Published courses available to learners.
      </p>

      {courses === undefined ? (
        <div className="py-16 text-center text-sm text-muted-foreground">Loading…</div>
      ) : courses.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
          No published courses yet. Publish a course to see it here.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((c) => (
            <Link
              key={c._id}
              to="/lms/learn/$courseId"
              params={{ courseId: c._id }}
              className="rounded-lg border border-border p-5 transition hover:border-primary hover:shadow-sm"
            >
              <BookOpen className="mb-3 h-6 w-6 text-muted-foreground" />
              <div className="font-medium">{c.title}</div>
              {c.excerpt && (
                <div className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                  {c.excerpt}
                </div>
              )}
              <div className="mt-3 text-xs text-muted-foreground">
                {c.lessonCount ?? 0} lessons
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
