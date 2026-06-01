/**
 * AI Course Generation — /lms/courses/$courseId/generate
 *
 * Brief → research-backed outline → approval → queued lesson-body jobs.
 */

import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useAction, useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, Clock, Info, Sparkles } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute(
  "/_authenticated/_admin/lms/courses/$courseId/generate",
)({
  component: GeneratePage,
});

function GeneratePage() {
  const { can } = useAuth();
  const canGenerateAi = can("lms.ai.generate");
  const { courseId } = Route.useParams();
  const generate = useAction(api.lms.ai.actions.generateCourse);
  const approveOutline = useMutation((api as any).lms.ai.mutations.approveOutline);
  const [showGenerations, setShowGenerations] = useState(false);
  const generations = useQuery(
    (api as any).lms.ai.queries.listCourseGenerations,
    showGenerations && canGenerateAi ? { courseId: courseId as Id<"lms_courses"> } : "skip",
  ) as GenerationSummary[] | undefined;

  const [topic, setTopic] = useState("");
  const [audience, setAudience] = useState("");
  const [topicsCount, setTopicsCount] = useState(5);
  const [tone, setTone] = useState("professional");
  const [busy, setBusy] = useState(false);

  async function handleGenerate() {
    if (!canGenerateAi) {
      toast.error("You do not have permission to generate LMS content.");
      return;
    }
    if (!topic.trim()) {
      toast.error("Enter a course topic");
      return;
    }
    setBusy(true);
    const tid = toast.loading("Researching and generating outline…");
    try {
      const res = await generate({
        courseId: courseId as Id<"lms_courses">,
        topic: topic.trim(),
        audience: audience.trim() || undefined,
        topicsCount,
        tone,
      });
      toast.success(
        `Outline ready: ${res.topicCount} topics, ${res.lessonCount} lessons`,
        { id: tid },
      );
      setShowGenerations(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Generation failed";
      toast.error(
        msg.includes("API key") || msg.includes("CONFIGURATION")
          ? "AI or Tavily key not configured. Set it in Settings -> AI Providers."
          : msg,
        { id: tid },
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleApprove(generationId: Id<"lms_ai_generations">) {
    if (!canGenerateAi) {
      toast.error("You do not have permission to approve generated content.");
      return;
    }
    const tid = toast.loading("Approving outline and queueing lesson bodies…");
    try {
      const result = await approveOutline({ generationId });
      toast.success(
        `Queued ${result.lessonCount} lesson-body jobs across ${result.topicCount} topics`,
        { id: tid },
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Approval failed", { id: tid });
    }
  }

  return (
    <div className="mx-auto max-w-2xl p-6">
      <Link
        to="/lms/courses/$courseId"
        params={{ courseId }}
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to course
      </Link>
      <div className="mb-6 flex items-center gap-3">
        <Sparkles className="h-6 w-6" />
        <h1 className="text-2xl font-semibold">Generate with AI</h1>
      </div>

      <div className="mb-6 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
        <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" />
        <p className="text-muted-foreground">
          Generates a Course - Topic - Lesson outline, then waits for explicit
          approval before creating lessons and queued lesson-body jobs. Requires
          AI and Tavily keys in{" "}
          <Link to="/settings/ai" className="text-primary hover:underline">
            Settings - AI Providers
          </Link>
          .
        </p>
      </div>

      <div className="space-y-4 rounded-lg border border-border p-6">
        {!canGenerateAi ? (
          <div className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
            AI generation is not available for your role.
          </div>
        ) : null}
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Course topic</span>
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            disabled={!canGenerateAi}
            placeholder="e.g. Real-time apps with Convex"
            className="w-full rounded-md border border-border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-70"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Audience</span>
          <input
            value={audience}
            onChange={(e) => setAudience(e.target.value)}
            disabled={!canGenerateAi}
            placeholder="e.g. Intermediate React developers"
            className="w-full rounded-md border border-border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-70"
          />
        </label>
        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Number of topics</span>
            <input
              type="number"
              min={1}
              max={12}
              value={topicsCount}
              onChange={(e) => setTopicsCount(Number(e.target.value))}
              disabled={!canGenerateAi}
              className="w-full rounded-md border border-border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-70"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Tone</span>
            <select
              value={tone}
              onChange={(e) => setTone(e.target.value)}
              disabled={!canGenerateAi}
              className="w-full rounded-md border border-border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-70"
            >
              <option value="professional">Professional</option>
              <option value="casual">Casual</option>
              <option value="academic">Academic</option>
            </select>
          </label>
        </div>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={busy || !canGenerateAi}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          <Sparkles className="h-4 w-4" /> {busy ? "Generating…" : "Generate course"}
        </button>
      </div>

      <div className="mt-6 space-y-3 rounded-lg border border-border p-6">
        <h2 className="text-sm font-semibold uppercase text-muted-foreground">
          Generated outlines
        </h2>
        <div className="mb-3 flex justify-end">
          {!showGenerations && canGenerateAi ? (
            <button
              type="button"
              onClick={() => setShowGenerations(true)}
              className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
            >
              Load generated outlines
            </button>
          ) : null}
        </div>
        {!canGenerateAi ? (
          <p className="text-sm text-muted-foreground">Generated outlines are hidden for your role.</p>
        ) : !showGenerations ? (
          <p className="text-sm text-muted-foreground">Generated outlines are not loaded.</p>
        ) : (generations ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No generated outlines yet.</p>
        ) : (
          <div className="space-y-3">
            {(generations ?? []).map((generation) => (
              <div
                key={generation._id}
                className="rounded-md border border-border p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium">
                      {generation.topicCount} topics, {generation.lessonCount} lessons
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(generation.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <StatusBadge generation={generation} />
                </div>
                <div className="mt-3 grid grid-cols-4 gap-2 text-xs text-muted-foreground">
                  <Metric label="Queued" value={generation.jobCounts.queued} />
                  <Metric label="Running" value={generation.jobCounts.running} />
                  <Metric label="Done" value={generation.jobCounts.done} />
                  <Metric label="Failed" value={generation.jobCounts.failed} />
                </div>
                <div className="mt-4 flex items-center gap-2">
                  {generation.reviewStatus === "unreviewed" ? (
                    <button
                      type="button"
                      onClick={() => handleApprove(generation._id)}
                      disabled={!canGenerateAi}
                      className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                    >
                      <CheckCircle2 className="h-4 w-4" /> Approve outline
                    </button>
                  ) : (
                    <Link
                      to="/lms/courses/$courseId/builder"
                      params={{ courseId }}
                      className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
                    >
                      Open builder
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface GenerationSummary {
  _id: Id<"lms_ai_generations">;
  createdAt: number;
  reviewStatus: "unreviewed" | "reviewed";
  topicCount: number;
  lessonCount: number;
  jobCounts: { queued: number; running: number; done: number; failed: number };
}

function StatusBadge({ generation }: { generation: GenerationSummary }) {
  if (generation.reviewStatus === "reviewed") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
        <CheckCircle2 className="h-3.5 w-3.5" /> Approved
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
      <Clock className="h-3.5 w-3.5" /> Awaiting review
    </span>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border px-2 py-1">
      <div className="font-medium text-foreground">{value}</div>
      <div>{label}</div>
    </div>
  );
}
