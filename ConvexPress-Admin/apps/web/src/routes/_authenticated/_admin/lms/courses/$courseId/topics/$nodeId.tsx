/**
 * Topic editor — /lms/courses/$courseId/topics/$nodeId
 */

import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { toast } from "sonner";
import { ArrowLeft, Save, Layers } from "lucide-react";

export const Route = createFileRoute(
  "/_authenticated/_admin/lms/courses/$courseId/topics/$nodeId",
)({
  component: TopicEditorPage,
});

type DripMode = "immediately" | "enrollment_based" | "specific_date";

function TopicEditorPage() {
  const { courseId, nodeId } = Route.useParams();
  const id = nodeId as Id<"lms_nodes">;
  const topic = useQuery(api.lms.topics.queries.getTopic, { nodeId: id }) as
    | { title: string; description?: string; topicDripMode?: DripMode; topicDripOffsetDays?: number }
    | null
    | undefined;
  const update = useMutation(api.lms.topics.mutations.updateTopic);

  const [description, setDescription] = useState("");
  const [dripMode, setDripMode] = useState<DripMode>("immediately");
  const [dripOffsetDays, setDripOffsetDays] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (topic) {
      setDescription(topic.description ?? "");
      setDripMode(topic.topicDripMode ?? "immediately");
      setDripOffsetDays(topic.topicDripOffsetDays ?? 0);
    }
  }, [topic]);

  async function handleSave() {
    setSaving(true);
    try {
      await update({ nodeId: id, description, dripMode, dripOffsetDays });
      toast.success("Topic saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl p-6">
      <Link
        to="/lms/courses/$courseId/builder"
        params={{ courseId }}
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to builder
      </Link>
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Layers className="h-6 w-6" />
          <h1 className="text-2xl font-semibold">{topic?.title ?? "Topic"}</h1>
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
          <span className="mb-1 block text-sm font-medium">Description</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            placeholder="Optional description shown to learners."
            className="w-full rounded-md border border-border px-3 py-2 text-sm"
          />
        </label>
        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Drip release (default for lessons)</span>
            <select
              value={dripMode}
              onChange={(e) => setDripMode(e.target.value as DripMode)}
              className="w-full rounded-md border border-border px-3 py-2 text-sm"
            >
              <option value="immediately">Immediately</option>
              <option value="enrollment_based">Days after enrollment</option>
              <option value="specific_date">Specific date</option>
            </select>
          </label>
          {dripMode === "enrollment_based" && (
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Days after enrollment</span>
              <input
                type="number"
                min={0}
                value={dripOffsetDays}
                onChange={(e) => setDripOffsetDays(Number(e.target.value))}
                className="w-full rounded-md border border-border px-3 py-2 text-sm"
              />
            </label>
          )}
        </div>
      </div>
    </div>
  );
}
