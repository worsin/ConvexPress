/**
 * Course list — /lms/courses
 */

import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import { api } from "@backend/convex/_generated/api";
import { toast } from "sonner";
import {
  Plus,
  BookOpen,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  Archive,
  Search,
  Copy,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/_admin/lms/courses/")({
  component: CourseListPage,
});

type StatusFilter = "all" | "published" | "draft" | "archived";

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "published", label: "Published" },
  { value: "draft", label: "Draft" },
  { value: "archived", label: "Archived" },
];

const STATUS_BADGE: Record<string, string> = {
  published: "bg-green-100 text-green-800",
  draft: "bg-amber-100 text-amber-800",
  archived: "bg-gray-200 text-gray-700",
};

function CourseListPage() {
  const [status, setStatus] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");

  const courses = useQuery(api.lms.courses.queries.list, {
    status: status === "all" ? undefined : status,
    search: search.trim() || undefined,
  }) as
    | Array<{
        _id: string;
        title: string;
        slug: string;
        status: string;
        lessonCount?: number;
        updatedAt: number;
      }>
    | undefined;

  const publish = useMutation(api.lms.courses.mutations.publish);
  const unpublish = useMutation(api.lms.courses.mutations.unpublish);
  const archive = useMutation(api.lms.courses.mutations.archive);
  const remove = useMutation(api.lms.courses.mutations.remove);
  const duplicate = useMutation(api.lms.courses.mutations.duplicate);

  async function run(label: string, fn: () => Promise<unknown>) {
    try {
      await fn();
      toast.success(label);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    }
  }

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BookOpen className="h-6 w-6" />
          <h1 className="text-2xl font-semibold">Courses</h1>
        </div>
        <Link
          to="/lms/courses/new"
          className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> Add New Course
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-md border border-border p-1">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setStatus(tab.value)}
              className={`rounded px-3 py-1 text-sm ${
                status === tab.value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search courses…"
            className="rounded-md border border-border py-1.5 pl-8 pr-3 text-sm"
          />
        </div>
      </div>

      {courses === undefined ? (
        <div className="py-16 text-center text-sm text-muted-foreground">
          Loading courses…
        </div>
      ) : courses.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-16 text-center">
          <BookOpen className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="mb-4 text-sm text-muted-foreground">
            No courses yet. Create your first course to get started.
          </p>
          <Link
            to="/lms/courses/new"
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> Add New Course
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Title</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Lessons</th>
                <th className="px-4 py-2 font-medium">Updated</th>
                <th className="px-4 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {courses.map((course) => (
                <tr key={course._id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <Link
                      to="/lms/courses/$courseId"
                      params={{ courseId: course._id }}
                      className="font-medium hover:underline"
                    >
                      {course.title}
                    </Link>
                    <div className="text-xs text-muted-foreground">/{course.slug}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                        STATUS_BADGE[course.status] ?? "bg-muted"
                      }`}
                    >
                      {course.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {course.lessonCount ?? 0}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(course.updatedAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Link
                        to="/lms/courses/$courseId"
                        params={{ courseId: course._id }}
                        className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                        title="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </Link>
                      <button
                        type="button"
                        title="Duplicate"
                        onClick={() =>
                          run("Duplicated", () => duplicate({ courseId: course._id }))
                        }
                        className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <Copy className="h-4 w-4" />
                      </button>
                      {course.status === "published" ? (
                        <button
                          type="button"
                          title="Unpublish"
                          onClick={() =>
                            run("Unpublished", () => unpublish({ courseId: course._id }))
                          }
                          className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          <EyeOff className="h-4 w-4" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          title="Publish"
                          onClick={() =>
                            run("Published", () => publish({ courseId: course._id }))
                          }
                          className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        type="button"
                        title="Archive"
                        onClick={() =>
                          run("Archived", () => archive({ courseId: course._id }))
                        }
                        className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <Archive className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        title="Delete"
                        onClick={() => {
                          if (
                            window.confirm(
                              `Delete "${course.title}"? This removes its curriculum and cannot be undone.`,
                            )
                          ) {
                            void run("Deleted", () => remove({ courseId: course._id }));
                          }
                        }}
                        className="rounded p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
