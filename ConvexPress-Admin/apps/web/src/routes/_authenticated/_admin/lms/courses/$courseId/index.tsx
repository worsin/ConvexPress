/**
 * Course settings editor — /lms/courses/$courseId
 */

import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { toast } from "sonner";
import { ArrowLeft, Save, Eye, EyeOff, Archive, Layers, Sparkles } from "lucide-react";

export const Route = createFileRoute("/_authenticated/_admin/lms/courses/$courseId/")({
  component: CourseSettingsPage,
});

type AccessMode = "open" | "free" | "members" | "buy" | "recurring" | "closed";
type ProgressionMode = "linear" | "free_form";
type ContentVisibility = "always" | "enrollees_only";

interface FormState {
  title: string;
  slug: string;
  excerpt: string;
  accessMode: AccessMode;
  progressionMode: ProgressionMode;
  contentVisibility: ContentVisibility;
  pointsAwarded: number;
  pointsRequired: number;
  seatLimit: number;
  accessDurationDays: number;
}

const EMPTY: FormState = {
  title: "",
  slug: "",
  excerpt: "",
  accessMode: "members",
  progressionMode: "linear",
  contentVisibility: "enrollees_only",
  pointsAwarded: 0,
  pointsRequired: 0,
  seatLimit: 0,
  accessDurationDays: 0,
};

function CourseSettingsPage() {
  const { courseId } = Route.useParams();
  const id = courseId as Id<"lms_courses">;
  const course = useQuery(api.lms.courses.queries.getById, { courseId: id });

  const update = useMutation(api.lms.courses.mutations.update);
  const publish = useMutation(api.lms.courses.mutations.publish);
  const unpublish = useMutation(api.lms.courses.mutations.unpublish);
  const archive = useMutation(api.lms.courses.mutations.archive);

  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (course) {
      setForm({
        title: course.title,
        slug: course.slug,
        excerpt: course.excerpt ?? "",
        accessMode: (course.accessMode ?? "members") as AccessMode,
        progressionMode: (course.progressionMode ?? "linear") as ProgressionMode,
        contentVisibility: (course.contentVisibility ?? "enrollees_only") as ContentVisibility,
        pointsAwarded: course.pointsAwarded ?? 0,
        pointsRequired: course.pointsRequired ?? 0,
        seatLimit: course.seatLimit ?? 0,
        accessDurationDays: course.accessDurationDays ?? 0,
      });
    }
  }, [course]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await update({
        courseId: id,
        title: form.title,
        slug: form.slug,
        excerpt: form.excerpt,
        accessMode: form.accessMode,
        progressionMode: form.progressionMode,
        contentVisibility: form.contentVisibility,
        pointsAwarded: form.pointsAwarded,
        pointsRequired: form.pointsRequired,
        seatLimit: form.seatLimit,
        accessDurationDays: form.accessDurationDays,
      });
      toast.success("Saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function run(label: string, fn: () => Promise<unknown>) {
    try {
      await fn();
      toast.success(label);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    }
  }

  if (course === undefined) {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  }
  if (course === null) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">Course not found.</p>
        <Link to="/lms/courses" className="text-sm text-primary hover:underline">
          Back to Courses
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <Link
        to="/lms/courses"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Courses
      </Link>

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{form.title || "Untitled course"}</h1>
          <span className="text-xs uppercase text-muted-foreground">
            {course.status}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {course.status === "published" ? (
            <button
              type="button"
              onClick={() => run("Unpublished", () => unpublish({ courseId: id }))}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
            >
              <EyeOff className="h-4 w-4" /> Unpublish
            </button>
          ) : (
            <button
              type="button"
              onClick={() => run("Published", () => publish({ courseId: id }))}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
            >
              <Eye className="h-4 w-4" /> Publish
            </button>
          )}
          <button
            type="button"
            onClick={() => run("Archived", () => archive({ courseId: id }))}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
          >
            <Archive className="h-4 w-4" /> Archive
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Link
          to="/lms/courses/$courseId/builder"
          params={{ courseId }}
          className="flex items-center gap-3 rounded-lg border border-border p-4 hover:border-primary"
        >
          <Layers className="h-5 w-5 text-muted-foreground" />
          <div>
            <div className="font-medium">Curriculum Builder</div>
            <div className="text-xs text-muted-foreground">
              Add topics &amp; lessons, drag to reorder.
            </div>
          </div>
        </Link>
        <Link
          to="/lms/courses/$courseId/generate"
          params={{ courseId }}
          className="flex items-center gap-3 rounded-lg border border-border p-4 hover:border-primary"
        >
          <Sparkles className="h-5 w-5 text-muted-foreground" />
          <div>
            <div className="font-medium">Generate with AI</div>
            <div className="text-xs text-muted-foreground">
              Outline &amp; lesson content from a brief.
            </div>
          </div>
        </Link>
      </div>

      <div className="space-y-6 rounded-lg border border-border p-6">
        <Field label="Title">
          <input
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
            className="w-full rounded-md border border-border px-3 py-2 text-sm"
          />
        </Field>
        <Field label="Slug">
          <input
            value={form.slug}
            onChange={(e) => set("slug", e.target.value)}
            className="w-full rounded-md border border-border px-3 py-2 text-sm"
          />
        </Field>
        <Field label="Excerpt">
          <textarea
            value={form.excerpt}
            onChange={(e) => set("excerpt", e.target.value)}
            rows={3}
            className="w-full rounded-md border border-border px-3 py-2 text-sm"
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Access mode">
            <select
              value={form.accessMode}
              onChange={(e) => set("accessMode", e.target.value as AccessMode)}
              className="w-full rounded-md border border-border px-3 py-2 text-sm"
            >
              <option value="open">Open (public)</option>
              <option value="free">Free (login required)</option>
              <option value="members">Members (plan-gated)</option>
              <option value="buy">Buy now</option>
              <option value="recurring">Recurring</option>
              <option value="closed">Closed</option>
            </select>
          </Field>
          <Field label="Progression">
            <select
              value={form.progressionMode}
              onChange={(e) => set("progressionMode", e.target.value as ProgressionMode)}
              className="w-full rounded-md border border-border px-3 py-2 text-sm"
            >
              <option value="linear">Linear (in order)</option>
              <option value="free_form">Free-form (any order)</option>
            </select>
          </Field>
          <Field label="Content visibility">
            <select
              value={form.contentVisibility}
              onChange={(e) =>
                set("contentVisibility", e.target.value as ContentVisibility)
              }
              className="w-full rounded-md border border-border px-3 py-2 text-sm"
            >
              <option value="enrollees_only">Enrollees only</option>
              <option value="always">Always visible</option>
            </select>
          </Field>
          <Field label="Seat limit (0 = unlimited)">
            <input
              type="number"
              min={0}
              value={form.seatLimit}
              onChange={(e) => set("seatLimit", Number(e.target.value))}
              className="w-full rounded-md border border-border px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Points awarded on completion">
            <input
              type="number"
              min={0}
              value={form.pointsAwarded}
              onChange={(e) => set("pointsAwarded", Number(e.target.value))}
              className="w-full rounded-md border border-border px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Points required to access">
            <input
              type="number"
              min={0}
              value={form.pointsRequired}
              onChange={(e) => set("pointsRequired", Number(e.target.value))}
              className="w-full rounded-md border border-border px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Access duration (days, 0 = lifetime)">
            <input
              type="number"
              min={0}
              value={form.accessDurationDays}
              onChange={(e) => set("accessDurationDays", Number(e.target.value))}
              className="w-full rounded-md border border-border px-3 py-2 text-sm"
            />
          </Field>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}
