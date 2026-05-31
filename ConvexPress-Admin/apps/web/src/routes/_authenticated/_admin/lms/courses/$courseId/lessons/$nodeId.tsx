/**
 * Lesson editor — /lms/courses/$courseId/lessons/$nodeId
 */

import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useAction, useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { toast } from "sonner";
import { ArrowLeft, Save, PlayCircle, Video, Sparkles } from "lucide-react";

export const Route = createFileRoute(
  "/_authenticated/_admin/lms/courses/$courseId/lessons/$nodeId",
)({
  component: LessonEditorPage,
});

type DripMode = "immediately" | "enrollment_based" | "specific_date";

const inp = "w-full rounded-md border border-border px-3 py-2 text-sm";

function LessonEditorPage() {
  const { courseId, nodeId } = Route.useParams();
  const id = nodeId as Id<"lms_nodes">;
  const lesson = useQuery(api.lms.lessons.queries.getLesson, { nodeId: id }) as
    | {
        node: {
          title: string;
          videoUrl?: string;
          isPreview?: boolean;
          requireVideoWatch?: boolean;
          autoComplete?: boolean;
          completionDelaySec?: number;
          minTimeSeconds?: number;
          showMarkComplete?: boolean;
          lessonDripMode?: DripMode;
          lessonDripOffsetDays?: number;
        };
        bodyText: string;
        materialsText: string;
      }
    | null
    | undefined;

  const update = useMutation(api.lms.lessons.mutations.updateLessonContent);
  const regenerate = useAction(api.lms.ai.actions.regenerateLesson);

  const [f, setF] = useState({
    title: "",
    videoUrl: "",
    bodyText: "",
    materialsText: "",
    isPreview: false,
    requireVideoWatch: false,
    autoComplete: false,
    completionDelaySec: 0,
    minTimeSeconds: 0,
    showMarkComplete: true,
    dripMode: "immediately" as DripMode,
    dripOffsetDays: 0,
  });
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  useEffect(() => {
    if (lesson?.node) {
      const n = lesson.node;
      setF({
        title: n.title,
        videoUrl: n.videoUrl ?? "",
        bodyText: lesson.bodyText ?? "",
        materialsText: lesson.materialsText ?? "",
        isPreview: n.isPreview ?? false,
        requireVideoWatch: n.requireVideoWatch ?? false,
        autoComplete: n.autoComplete ?? false,
        completionDelaySec: n.completionDelaySec ?? 0,
        minTimeSeconds: n.minTimeSeconds ?? 0,
        showMarkComplete: n.showMarkComplete ?? true,
        dripMode: (n.lessonDripMode ?? "immediately") as DripMode,
        dripOffsetDays: n.lessonDripOffsetDays ?? 0,
      });
    }
  }, [lesson]);

  function set<K extends keyof typeof f>(k: K, v: (typeof f)[K]) {
    setF((s) => ({ ...s, [k]: v }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await update({
        nodeId: id,
        title: f.title,
        videoUrl: f.videoUrl,
        bodyText: f.bodyText,
        materialsText: f.materialsText,
        isPreview: f.isPreview,
        requireVideoWatch: f.requireVideoWatch,
        autoComplete: f.autoComplete,
        completionDelaySec: f.completionDelaySec,
        minTimeSeconds: f.minTimeSeconds,
        showMarkComplete: f.showMarkComplete,
        dripMode: f.dripMode,
        dripOffsetDays: f.dripOffsetDays,
      });
      toast.success("Lesson saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleRegenerate() {
    setRegenerating(true);
    const tid = toast.loading("Generating lesson content…");
    try {
      await regenerate({ nodeId: id });
      toast.success("Lesson content regenerated", { id: tid });
    } catch (err) {
      const data = (err as { data?: { message?: string } })?.data;
      toast.error(data?.message ?? (err instanceof Error ? err.message : "Failed"), {
        id: tid,
      });
    } finally {
      setRegenerating(false);
    }
  }

  if (lesson === undefined) {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  }
  if (lesson === null) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">Lesson not found.</p>
        <Link to="/lms/courses/$courseId/builder" params={{ courseId }} className="text-sm text-primary hover:underline">
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
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleRegenerate}
            disabled={regenerating}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
            title="Regenerate this lesson's content with AI"
          >
            <Sparkles className="h-4 w-4" /> {regenerating ? "Generating…" : "AI regenerate"}
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

      <div className="space-y-5 rounded-lg border border-border p-6">
        <L label="Lesson title">
          <input value={f.title} onChange={(e) => set("title", e.target.value)} className={inp} />
        </L>
        <L label={<span className="flex items-center gap-1.5"><Video className="h-4 w-4" /> Video URL</span>}>
          <input value={f.videoUrl} onChange={(e) => set("videoUrl", e.target.value)} placeholder="YouTube / Vimeo / Wistia / upload URL" className={inp} />
        </L>
        <L label="Lesson body">
          <textarea value={f.bodyText} onChange={(e) => set("bodyText", e.target.value)} rows={10} placeholder="Lesson content. Paragraphs separated by blank lines." className={inp} />
        </L>
        <L label="Materials & resources">
          <textarea value={f.materialsText} onChange={(e) => set("materialsText", e.target.value)} rows={4} placeholder="Supplemental links, downloads, references…" className={inp} />
        </L>
      </div>

      <div className="mt-4 space-y-4 rounded-lg border border-border p-6">
        <h2 className="text-sm font-semibold uppercase text-muted-foreground">Lesson settings</h2>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <Chk label="Free preview" checked={f.isPreview} onChange={(v) => set("isPreview", v)} />
          <Chk label="Require video watch" checked={f.requireVideoWatch} onChange={(v) => set("requireVideoWatch", v)} />
          <Chk label="Auto-complete after video" checked={f.autoComplete} onChange={(v) => set("autoComplete", v)} />
          <Chk label="Show 'Mark complete'" checked={f.showMarkComplete} onChange={(v) => set("showMarkComplete", v)} />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <L label="Auto-complete delay (s)">
            <input type="number" min={0} value={f.completionDelaySec} onChange={(e) => set("completionDelaySec", Number(e.target.value))} className={inp} />
          </L>
          <L label="Min. time on lesson (s)">
            <input type="number" min={0} value={f.minTimeSeconds} onChange={(e) => set("minTimeSeconds", Number(e.target.value))} className={inp} />
          </L>
          <L label="Drip release">
            <select value={f.dripMode} onChange={(e) => set("dripMode", e.target.value as DripMode)} className={inp}>
              <option value="immediately">Immediately</option>
              <option value="enrollment_based">Days after enrollment</option>
              <option value="specific_date">Specific date</option>
            </select>
          </L>
          {f.dripMode === "enrollment_based" && (
            <L label="Days after enrollment">
              <input type="number" min={0} value={f.dripOffsetDays} onChange={(e) => set("dripOffsetDays", Number(e.target.value))} className={inp} />
            </L>
          )}
        </div>
      </div>
    </div>
  );
}

function L({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}

function Chk({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}
