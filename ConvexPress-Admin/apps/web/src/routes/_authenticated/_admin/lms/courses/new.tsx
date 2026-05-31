/**
 * New Course — /lms/courses/new
 */

import { useState } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import { toast } from "sonner";
import { GraduationCap, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/_authenticated/_admin/lms/courses/new")({
  component: NewCoursePage,
});

function NewCoursePage() {
  const navigate = useNavigate();
  const createCourse = useMutation(api.lms.courses.mutations.create);
  const [title, setTitle] = useState("");
  const [creating, setCreating] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    setCreating(true);
    try {
      const courseId = await createCourse({ title: title.trim() });
      toast.success("Course created");
      await navigate({ to: "/lms/courses/$courseId", params: { courseId } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create course");
      setCreating(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl p-6">
      <Link
        to="/lms/courses"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Courses
      </Link>
      <div className="mb-6 flex items-center gap-3">
        <GraduationCap className="h-6 w-6" />
        <h1 className="text-2xl font-semibold">Add New Course</h1>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="course-title">
            Course title
          </label>
          <input
            id="course-title"
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Introduction to TypeScript"
            className="w-full rounded-md border border-border px-3 py-2 text-sm"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            You can add topics, lessons, and settings on the next screen.
          </p>
        </div>
        <button
          type="submit"
          disabled={creating}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {creating ? "Creating…" : "Create course"}
        </button>
      </form>
    </div>
  );
}
