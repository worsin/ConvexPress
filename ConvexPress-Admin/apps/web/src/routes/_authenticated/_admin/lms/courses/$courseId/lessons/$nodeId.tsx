/**
 * Lesson editor — /lms/courses/$courseId/lessons/$nodeId
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useAction, useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileText,
  History,
  Loader2,
  PlayCircle,
  RotateCcw,
  Save,
  ShieldCheck,
  Sparkles,
  Video,
} from "lucide-react";

import { LessonRichTextEditor } from "@/components/lms/LessonRichTextEditor";
import { MediaSelector } from "@/components/lms/MediaSelector";
import { cn } from "@/lib/utils";

export const Route = createFileRoute(
  "/_authenticated/_admin/lms/courses/$courseId/lessons/$nodeId",
)({
  component: LessonEditorPage,
});

type DripMode = "immediately" | "enrollment_based" | "specific_date";

type LessonForm = {
  title: string;
  videoUrl: string;
  videoMediaId: Id<"media"> | null;
  bodyText: string;
  materialsText: string;
  isPreview: boolean;
  requireVideoWatch: boolean;
  autoComplete: boolean;
  completionDelaySec: number;
  minTimeSeconds: number;
  showMarkComplete: boolean;
  dripMode: DripMode;
  dripOffsetDays: number;
  dripDate: string;
};

type LessonQueryResult = {
  node: {
    title: string;
    videoUrl?: string;
    videoProvider?: string;
    videoMediaId?: Id<"media">;
    isPreview?: boolean;
    requireVideoWatch?: boolean;
    autoComplete?: boolean;
    completionDelaySec?: number;
    minTimeSeconds?: number;
    showMarkComplete?: boolean;
    lessonDripMode?: DripMode;
    lessonDripOffsetDays?: number;
    lessonDripDate?: number;
    updatedAt?: number;
  };
  bodyText: string;
  materialsText: string;
};

type LessonVersion = {
  _id: Id<"lms_lessonVersions">;
  bodyText: string;
  createdAt: number;
};

type StoredDraft = {
  form: LessonForm;
  savedAt: number;
  baseSnapshot: string;
};

const emptyForm: LessonForm = {
  title: "",
  videoUrl: "",
  videoMediaId: null,
  bodyText: "",
  materialsText: "",
  isPreview: false,
  requireVideoWatch: false,
  autoComplete: false,
  completionDelaySec: 0,
  minTimeSeconds: 0,
  showMarkComplete: true,
  dripMode: "immediately",
  dripOffsetDays: 0,
  dripDate: "",
};

const inputClass =
  "w-full rounded-none border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary";

function LessonEditorPage() {
  const { courseId, nodeId } = Route.useParams();
  const id = nodeId as Id<"lms_nodes">;
  const draftKey = `convexpress:lms:lesson-draft:${id}`;
  const lesson = useQuery(api.lms.lessons.queries.getLesson, { nodeId: id }) as
    | LessonQueryResult
    | null
    | undefined;
  const versions = useQuery(api.lms.lessons.queries.listVersions, { nodeId: id }) as
    | LessonVersion[]
    | undefined;

  const update = useMutation(api.lms.lessons.mutations.updateLessonContent);
  const restoreVersion = useMutation(api.lms.lessons.mutations.restoreLessonVersion);
  const regenerate = useAction(api.lms.ai.actions.regenerateLesson);

  const [form, setForm] = useState<LessonForm>(emptyForm);
  const [loadedKey, setLoadedKey] = useState("");
  const [lastSavedSnapshot, setLastSavedSnapshot] = useState("");
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [draft, setDraft] = useState<StoredDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  const videoMedia = useQuery(
    api.media.queries.get,
    form.videoMediaId ? { mediaId: form.videoMediaId } : "skip",
  ) as { title?: string; url?: string | null; fileName?: string } | null | undefined;

  const validation = useMemo(() => validateForm(form), [form]);
  const currentSnapshot = useMemo(() => snapshotForm(form), [form]);
  const isDirty = !!lastSavedSnapshot && currentSnapshot !== lastSavedSnapshot;
  const videoPreviewUrl = videoMedia?.url || form.videoUrl.trim();
  const videoProvider = getVideoProvider(videoPreviewUrl);

  useEffect(() => {
    if (!lesson?.node) return;
    const nextLoadedKey = `${id}:${lesson.node.updatedAt ?? 0}`;
    if (loadedKey === nextLoadedKey) return;
    const nextForm = formFromLesson(lesson);
    const snapshot = snapshotForm(nextForm);
    setForm(nextForm);
    setLastSavedSnapshot(snapshot);
    setLastSavedAt(lesson.node.updatedAt ?? null);
    setLoadedKey(nextLoadedKey);

    const stored = readDraft(draftKey);
    setDraft(stored && stored.baseSnapshot === snapshot ? stored : null);
  }, [draftKey, id, lesson, loadedKey]);

  useEffect(() => {
    if (!lastSavedSnapshot) return;
    if (!isDirty) return;
    writeDraft(draftKey, {
      form,
      savedAt: Date.now(),
      baseSnapshot: lastSavedSnapshot,
    });
  }, [draftKey, form, isDirty, lastSavedSnapshot]);

  useEffect(() => {
    if (!isDirty) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  const handleSave = useCallback(async () => {
    const errors = validateForm(form);
    if (errors.length > 0) {
      toast.error(errors[0]);
      return;
    }
    const clean = cleanForm(form);
    setSaving(true);
    try {
      await update({
        nodeId: id,
        title: clean.title,
        videoUrl: clean.videoUrl,
        videoMediaId: clean.videoMediaId ?? undefined,
        bodyText: clean.bodyText,
        materialsText: clean.materialsText,
        isPreview: clean.isPreview,
        requireVideoWatch: clean.requireVideoWatch,
        autoComplete: clean.autoComplete,
        completionDelaySec: clean.completionDelaySec,
        minTimeSeconds: clean.minTimeSeconds,
        showMarkComplete: clean.showMarkComplete,
        dripMode: clean.dripMode,
        dripOffsetDays: clean.dripOffsetDays,
        dripDate: fromDateTimeInput(clean.dripDate),
      });
      const snapshot = snapshotForm(clean);
      setForm(clean);
      setLastSavedSnapshot(snapshot);
      setLastSavedAt(Date.now());
      clearDraft(draftKey);
      setDraft(null);
      toast.success("Lesson saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }, [draftKey, form, id, update]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "s") return;
      event.preventDefault();
      void handleSave();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleSave]);

  function set<K extends keyof LessonForm>(key: K, value: LessonForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleRegenerate() {
    if (isDirty) {
      toast.error("Save or discard lesson changes before regenerating content.");
      return;
    }
    setRegenerating(true);
    const tid = toast.loading("Generating lesson content...");
    try {
      await regenerate({ nodeId: id });
      clearDraft(draftKey);
      setDraft(null);
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

  async function handleRestore(versionId: Id<"lms_lessonVersions">) {
    if (!window.confirm("Restore this lesson body revision?")) return;
    try {
      await restoreVersion({ nodeId: id, versionId });
      clearDraft(draftKey);
      setDraft(null);
      toast.success("Lesson version restored");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Restore failed");
    }
  }

  if (lesson === undefined) {
    return (
      <div className="flex min-h-96 items-center justify-center p-6 text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
        Loading lesson editor...
      </div>
    );
  }
  if (lesson === null) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">Lesson not found.</p>
        <Link
          to="/lms/courses/$courseId/builder"
          params={{ courseId }}
          className="mt-3 inline-flex items-center gap-1 text-sm text-primary hover:underline"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to builder
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/lms/courses/$courseId/builder"
          params={{ courseId }}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to builder
        </Link>
        <SaveState saving={saving} dirty={isDirty} lastSavedAt={lastSavedAt} />
      </div>

      <div className="mb-6 grid gap-5 lg:grid-cols-[1fr_21rem]">
        <div className="min-w-0">
          <h1 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <PlayCircle className="size-4" aria-hidden="true" />
            Edit Lesson
          </h1>
          <label htmlFor="lesson-title" className="sr-only">
            Lesson title
          </label>
          <input
            id="lesson-title"
            value={form.title}
            onChange={(event) => set("title", event.target.value)}
            aria-invalid={validation.some((error) => error.includes("title"))}
            placeholder="Lesson title"
            className="w-full rounded-none border-0 border-b border-border bg-transparent px-0 pb-3 text-3xl font-semibold tracking-tight outline-none placeholder:text-muted-foreground focus:border-primary md:text-4xl"
          />
        </div>
        <div className="flex flex-wrap items-start justify-end gap-2">
          <button
            type="button"
            onClick={handleRegenerate}
            disabled={regenerating || isDirty}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-none border border-border px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
            title={
              isDirty
                ? "Save or discard changes before AI regeneration"
                : "Regenerate this lesson's content with AI"
            }
          >
            <Sparkles className="size-4" aria-hidden="true" />
            {regenerating ? "Generating..." : "AI regenerate"}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || validation.length > 0}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-none bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Save className="size-4" aria-hidden="true" />
            )}
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      {draft ? (
        <DraftRecovery
          draft={draft}
          onRestore={() => {
            setForm(draft.form);
            setDraft(null);
            toast.success("Local draft restored");
          }}
          onDiscard={() => {
            clearDraft(draftKey);
            setDraft(null);
          }}
        />
      ) : null}

      {validation.length > 0 ? <ValidationSummary errors={validation} /> : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <main className="min-w-0 space-y-6">
          <section className="border border-border bg-card p-5">
            <LessonRichTextEditor
              label="Lesson body"
              value={form.bodyText}
              onChange={(value) => set("bodyText", value)}
              placeholder="Write the lesson body..."
              description="Structured lesson content saved as TipTap-compatible JSON."
              minRows={18}
            />
          </section>

          <section className="border border-border bg-card p-5">
            <LessonRichTextEditor
              label="Materials & resources"
              value={form.materialsText}
              onChange={(value) => set("materialsText", value)}
              placeholder="Links, downloads, reference notes..."
              description="Learner-facing supplemental resources for this lesson."
              minRows={8}
            />
          </section>
        </main>

        <aside className="space-y-4">
          <Panel title="Publish" icon={<ShieldCheck className="size-4" aria-hidden="true" />}>
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-muted-foreground">State</span>
                <SaveState saving={saving} dirty={isDirty} lastSavedAt={lastSavedAt} compact />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Link
                  to="/lms/learn/$courseId"
                  params={{ courseId }}
                  className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-none border border-border px-3 text-sm hover:bg-muted"
                >
                  <ExternalLink className="size-4" aria-hidden="true" />
                  Preview
                </Link>
                <Link
                  to="/lms/courses/$courseId/builder"
                  params={{ courseId }}
                  className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-none border border-border px-3 text-sm hover:bg-muted"
                >
                  <BookOpen className="size-4" aria-hidden="true" />
                  Builder
                </Link>
              </div>
            </div>
          </Panel>

          <Panel title="Video" icon={<Video className="size-4" aria-hidden="true" />}>
            <div className="space-y-4">
              <Field label="Video URL" htmlFor="lesson-video-url">
                <input
                  id="lesson-video-url"
                  value={form.videoUrl}
                  onChange={(event) => set("videoUrl", event.target.value)}
                  placeholder="https://youtube.com/watch?v=..."
                  className={inputClass}
                  aria-invalid={validation.some((error) => error.includes("video URL"))}
                />
              </Field>
              <Field label="Uploaded video">
                <MediaSelector
                  mediaType="video"
                  value={form.videoMediaId}
                  onChange={(value) => set("videoMediaId", value)}
                  placeholder="Search videos"
                />
              </Field>
              <VideoPreview url={videoPreviewUrl} provider={videoProvider} mediaTitle={videoMedia?.title} />
            </div>
          </Panel>

          <Panel title="Completion" icon={<CheckCircle2 className="size-4" aria-hidden="true" />}>
            <div className="space-y-3">
              <ToggleField
                label="Free preview"
                checked={form.isPreview}
                onChange={(value) => set("isPreview", value)}
              />
              <ToggleField
                label="Require video watch"
                checked={form.requireVideoWatch}
                onChange={(value) => set("requireVideoWatch", value)}
              />
              <ToggleField
                label="Auto-complete"
                checked={form.autoComplete}
                onChange={(value) => set("autoComplete", value)}
              />
              <ToggleField
                label="Show mark complete"
                checked={form.showMarkComplete}
                onChange={(value) => set("showMarkComplete", value)}
              />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Delay sec." htmlFor="lesson-completion-delay">
                  <input
                    id="lesson-completion-delay"
                    type="number"
                    min={0}
                    value={form.completionDelaySec}
                    onChange={(event) => set("completionDelaySec", numberValue(event.target.value))}
                    className={inputClass}
                  />
                </Field>
                <Field label="Min. time sec." htmlFor="lesson-min-time">
                  <input
                    id="lesson-min-time"
                    type="number"
                    min={0}
                    value={form.minTimeSeconds}
                    onChange={(event) => set("minTimeSeconds", numberValue(event.target.value))}
                    className={inputClass}
                  />
                </Field>
              </div>
            </div>
          </Panel>

          <Panel title="Drip" icon={<Clock3 className="size-4" aria-hidden="true" />}>
            <div className="space-y-3">
              <Field label="Release rule" htmlFor="lesson-drip-mode">
                <select
                  id="lesson-drip-mode"
                  value={form.dripMode}
                  onChange={(event) => set("dripMode", event.target.value as DripMode)}
                  className={inputClass}
                >
                  <option value="immediately">Immediately</option>
                  <option value="enrollment_based">Days after enrollment</option>
                  <option value="specific_date">Specific date</option>
                </select>
              </Field>
              {form.dripMode === "enrollment_based" ? (
                <Field label="Days after enrollment" htmlFor="lesson-drip-days">
                  <input
                    id="lesson-drip-days"
                    type="number"
                    min={0}
                    value={form.dripOffsetDays}
                    onChange={(event) => set("dripOffsetDays", numberValue(event.target.value))}
                    className={inputClass}
                  />
                </Field>
              ) : null}
              {form.dripMode === "specific_date" ? (
                <Field label="Release date" htmlFor="lesson-drip-date">
                  <input
                    id="lesson-drip-date"
                    type="datetime-local"
                    value={form.dripDate}
                    onChange={(event) => set("dripDate", event.target.value)}
                    className={inputClass}
                  />
                </Field>
              ) : null}
            </div>
          </Panel>

          <Panel title="Revisions" icon={<History className="size-4" aria-hidden="true" />}>
            {(versions ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No saved revisions yet.</p>
            ) : (
              <div className="space-y-2">
                {(versions ?? []).slice(0, 8).map((version) => (
                  <div key={version._id} className="border border-border p-3">
                    <div className="mb-1 flex items-center justify-between gap-3">
                      <span className="text-xs font-medium">
                        {new Date(version.createdAt).toLocaleString()}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRestore(version._id)}
                        className="inline-flex items-center gap-1 rounded-none border border-border px-2 py-1 text-xs hover:bg-muted"
                      >
                        <RotateCcw className="size-3" aria-hidden="true" />
                        Restore
                      </button>
                    </div>
                    <p className="line-clamp-2 text-xs leading-5 text-muted-foreground">
                      {version.bodyText || "Empty body"}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </aside>
      </div>
    </div>
  );
}

function formFromLesson(lesson: LessonQueryResult): LessonForm {
  const node = lesson.node;
  return {
    title: node.title,
    videoUrl: node.videoUrl ?? "",
    videoMediaId: node.videoMediaId ?? null,
    bodyText: lesson.bodyText ?? "",
    materialsText: lesson.materialsText ?? "",
    isPreview: node.isPreview ?? false,
    requireVideoWatch: node.requireVideoWatch ?? false,
    autoComplete: node.autoComplete ?? false,
    completionDelaySec: node.completionDelaySec ?? 0,
    minTimeSeconds: node.minTimeSeconds ?? 0,
    showMarkComplete: node.showMarkComplete ?? true,
    dripMode: (node.lessonDripMode ?? "immediately") as DripMode,
    dripOffsetDays: node.lessonDripOffsetDays ?? 0,
    dripDate: toDateTimeInput(node.lessonDripDate),
  };
}

function cleanForm(form: LessonForm): LessonForm {
  const dripMode = form.dripMode;
  return {
    ...form,
    title: form.title.trim().replace(/\s+/g, " ") || "Untitled lesson",
    videoUrl: form.videoUrl.trim(),
    bodyText: form.bodyText.trim(),
    materialsText: form.materialsText.trim(),
    completionDelaySec: numberValue(form.completionDelaySec),
    minTimeSeconds: numberValue(form.minTimeSeconds),
    dripOffsetDays: dripMode === "enrollment_based" ? numberValue(form.dripOffsetDays) : 0,
    dripDate: dripMode === "specific_date" ? form.dripDate : "",
  };
}

function snapshotForm(form: LessonForm): string {
  return JSON.stringify(cleanForm(form));
}

function validateForm(form: LessonForm): string[] {
  const clean = cleanForm(form);
  const errors: string[] = [];
  const title = form.title.trim();
  if (!title) errors.push("Lesson title is required.");
  if (title.length > 180) errors.push("Lesson title must be 180 characters or less.");
  if (clean.videoUrl && !isHttpUrl(clean.videoUrl)) {
    errors.push("Video URL must be a valid http or https URL.");
  }
  if (clean.requireVideoWatch && !clean.videoUrl && !clean.videoMediaId) {
    errors.push("Require video watch needs a video URL or uploaded video.");
  }
  if (clean.dripMode === "specific_date" && !clean.dripDate) {
    errors.push("Specific-date drip requires a release date.");
  }
  return errors;
}

function SaveState({
  saving,
  dirty,
  lastSavedAt,
  compact = false,
}: {
  saving: boolean;
  dirty: boolean;
  lastSavedAt: number | null;
  compact?: boolean;
}) {
  const label = saving
    ? "Saving..."
    : dirty
      ? "Unsaved changes"
      : lastSavedAt
        ? `Saved ${new Date(lastSavedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
        : "Saved";
  return (
    <span
      role="status"
      aria-live="polite"
      className={cn(
        "inline-flex items-center gap-1.5 border px-2.5 py-1 text-xs font-medium",
        dirty
          ? "border-primary/30 bg-primary/10 text-primary"
          : "border-border bg-muted text-muted-foreground",
        compact ? "px-2 py-0.5" : "",
      )}
    >
      {saving ? (
        <Loader2 className="size-3 animate-spin" aria-hidden="true" />
      ) : dirty ? (
        <AlertTriangle className="size-3" aria-hidden="true" />
      ) : (
        <CheckCircle2 className="size-3" aria-hidden="true" />
      )}
      {label}
    </span>
  );
}

function DraftRecovery({
  draft,
  onRestore,
  onDiscard,
}: {
  draft: StoredDraft;
  onRestore: () => void;
  onDiscard: () => void;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border border-primary/40 bg-primary/10 p-3">
      <div className="flex min-w-0 items-center gap-2 text-sm">
        <FileText className="size-4 shrink-0 text-primary" aria-hidden="true" />
        <span>
          Local draft from {new Date(draft.savedAt).toLocaleString()} is available.
        </span>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onDiscard}
          className="rounded-none border border-border px-3 py-1.5 text-xs hover:bg-muted"
        >
          Discard
        </button>
        <button
          type="button"
          onClick={onRestore}
          className="rounded-none bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
        >
          Restore draft
        </button>
      </div>
    </div>
  );
}

function ValidationSummary({ errors }: { errors: string[] }) {
  return (
    <div className="mb-5 border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
      <div className="mb-1 flex items-center gap-2 font-medium">
        <AlertTriangle className="size-4" aria-hidden="true" />
        Fix these before saving
      </div>
      <ul className="list-disc space-y-1 pl-5">
        {errors.map((error) => (
          <li key={error}>{error}</li>
        ))}
      </ul>
    </div>
  );
}

function Panel({
  title,
  icon,
  children,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="border border-border bg-card">
      <h2 className="flex items-center gap-2 border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {icon}
        {title}
      </h2>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: ReactNode;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <label className="block" htmlFor={htmlFor}>
      <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function ToggleField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 text-sm">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="size-4 rounded-none border-border accent-primary"
      />
    </label>
  );
}

function VideoPreview({
  url,
  provider,
  mediaTitle,
}: {
  url: string;
  provider: string;
  mediaTitle?: string;
}) {
  if (!url) {
    return (
      <div className="border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
        No video selected.
      </div>
    );
  }
  const embedUrl = getEmbedUrl(url);
  if (embedUrl) {
    return (
      <div className="space-y-2">
        <iframe
          title="Lesson video preview"
          className="aspect-video w-full border border-border"
          src={embedUrl}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
        <p className="text-xs text-muted-foreground">{providerLabel(provider)}</p>
      </div>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="flex items-center justify-between gap-3 border border-border p-3 text-sm hover:bg-muted"
    >
      <span className="min-w-0 truncate">{mediaTitle || url}</span>
      <ExternalLink className="size-4 shrink-0" aria-hidden="true" />
    </a>
  );
}

function toDateTimeInput(value?: number): string {
  if (!value) return "";
  const date = new Date(value);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function fromDateTimeInput(value: string): number | undefined {
  if (!value) return undefined;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : undefined;
}

function numberValue(value: string | number): number {
  const next = typeof value === "number" ? value : Number(value);
  return Number.isFinite(next) ? Math.max(0, Math.floor(next)) : 0;
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function getVideoProvider(url: string) {
  const value = url.toLowerCase();
  if (value.includes("youtube.com") || value.includes("youtu.be")) return "youtube";
  if (value.includes("vimeo.com")) return "vimeo";
  if (value.includes("wistia.")) return "wistia";
  if (value.includes("bunnycdn") || value.includes("mediadelivery")) return "bunny";
  return url ? "external" : "none";
}

function providerLabel(provider: string) {
  if (provider === "youtube") return "YouTube video";
  if (provider === "vimeo") return "Vimeo video";
  if (provider === "wistia") return "Wistia video";
  if (provider === "bunny") return "Bunny Stream video";
  return "External video";
}

function getEmbedUrl(url: string) {
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/);
  const vimeo = url.match(/vimeo\.com\/(\d+)/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;
  return null;
}

function readDraft(key: string): StoredDraft | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as StoredDraft) : null;
  } catch {
    return null;
  }
}

function writeDraft(key: string, draft: StoredDraft) {
  try {
    window.localStorage.setItem(key, JSON.stringify(draft));
  } catch {
    // Ignore local draft quota errors; the server save path remains authoritative.
  }
}

function clearDraft(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore local draft cleanup errors.
  }
}
