/**
 * Lesson editor — /lms/courses/$courseId/lessons/$nodeId
 */

import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { toast } from "sonner";
import { ArrowLeft, Save, PlayCircle, Video } from "lucide-react";

export const Route = createFileRoute(
  "/_authenticated/_admin/lms/courses/$courseId/lessons/$nodeId",
)({
  component: LessonEditorPage,
});

function LessonEditorPage() {
  const { courseId, nodeId } = Route.useParams();
  const lesson = useQuery(api.lms.lessons.queries.getLesson, {
    nodeId: nodeId as Id<"lms_nodes">,
  });
  const update = useMutation(api.lms.lessons.mutations.updateLessonContent);

  const [title, setTitle] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [isPreview, setIsPreview] = useState(false);
  const [requireVideoWatch, setRequireVideoWatch] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (lesson?.node) {
      setTitle(lesson.node.title);
      setVideoUrl(lesson.node.videoUrl ?? "");
      setBodyText(lesson.bodyText ?? "");
      setIsPreview(lesson.node.isPreview ?? false);
      setRequireVideoWatch(lesson.node.requireVideoWatch ?? false);
    }
  }, [lesson]);

  async function handleSave() {
    setSaving(true);
    try {
      await update({
        nodeId: nodeId as Id<"lms_nodes">,
        title,
        videoUrl,
        bodyText,
        isPreview,
        requireVideoWatch,
      });
      toast.success("Lesson saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (lesson === undefined) {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  }
  if (lesson === null) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">Lesson not found.</p>
        <Link
          to="/lms/courses/$courseId/builder"
          params={{ courseId }}
          className="text-sm text-primary hover:underline"
        >
          Back to builder
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      <Link
        to="/lms/courses/$courseId/builder"
        params={{ courseId }}
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to builder
      </Link>

      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <PlayCircle className="h-6 w-6" />
          <h1 className="text-2xl font-semibold">Edit Lesson</h1>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save"}
        </button>
      </div>

      <div className="space-y-5 rounded-lg border border-border p-6">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Lesson title</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-md border border-border px-3 py-2 text-sm"
          />
        </label>

        <label className="block">
          <span className="mb-1 flex items-center gap-1.5 text-sm font-medium">
            <Video className="h-4 w-4" /> Video URL
          </span>
          <input
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            placeholder="https://youtube.com/watch?v=…  (or Vimeo, Wistia, upload URL)"
            className="w-full rounded-md border border-border px-3 py-2 text-sm"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium">Lesson body</span>
          <textarea
            value={bodyText}
            onChange={(e) => setBodyText(e.target.value)}
            rows={10}
            placeholder="Write the lesson content here. (A rich Tiptap editor is a follow-up; paragraphs are separated by blank lines.)"
            className="w-full rounded-md border border-border px-3 py-2 text-sm"
          />
        </label>

        <div className="flex flex-wrap gap-6">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isPreview}
              onChange={(e) => setIsPreview(e.target.checked)}
            />
            Free preview (visible to non-enrolled)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={requireVideoWatch}
              onChange={(e) => setRequireVideoWatch(e.target.checked)}
            />
            Require video watch before completion
          </label>
        </div>
      </div>
    </div>
  );
}
