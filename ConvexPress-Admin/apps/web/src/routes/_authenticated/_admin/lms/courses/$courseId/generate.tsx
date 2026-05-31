/**
 * AI Course Generation — /lms/courses/$courseId/generate
 *
 * Brief → Claude (via the platform AI provider) → Course → Topic → Lesson tree.
 * Requires an AI provider key (Settings → AI Providers) at runtime.
 */

import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useAction } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { toast } from "sonner";
import { ArrowLeft, Sparkles, Info } from "lucide-react";

export const Route = createFileRoute(
  "/_authenticated/_admin/lms/courses/$courseId/generate",
)({
  component: GeneratePage,
});

function GeneratePage() {
  const { courseId } = Route.useParams();
  const navigate = useNavigate();
  const generate = useAction(api.lms.ai.actions.generateCourse);

  const [topic, setTopic] = useState("");
  const [audience, setAudience] = useState("");
  const [topicsCount, setTopicsCount] = useState(5);
  const [tone, setTone] = useState("professional");
  const [busy, setBusy] = useState(false);

  async function handleGenerate() {
    if (!topic.trim()) {
      toast.error("Enter a course topic");
      return;
    }
    setBusy(true);
    const tid = toast.loading("Generating course outline & lessons…");
    try {
      const res = await generate({
        courseId: courseId as Id<"lms_courses">,
        topic: topic.trim(),
        audience: audience.trim() || undefined,
        topicsCount,
        tone,
      });
      toast.success(
        `Generated ${res.topicCount} topics, ${res.lessonCount} lessons`,
        { id: tid },
      );
      await navigate({ to: "/lms/courses/$courseId/builder", params: { courseId } });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Generation failed";
      toast.error(
        msg.includes("API key") || msg.includes("CONFIGURATION")
          ? "AI provider key not configured — set it in Settings → AI Providers."
          : msg,
        { id: tid },
      );
    } finally {
      setBusy(false);
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
          Generates a Course → Topic → Lesson outline with draft lesson bodies,
          then drops you into the builder to review &amp; edit. Requires an AI
          provider key in{" "}
          <Link to="/settings/ai" className="text-primary hover:underline">
            Settings → AI Providers
          </Link>
          .
        </p>
      </div>

      <div className="space-y-4 rounded-lg border border-border p-6">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Course topic</span>
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g. Real-time apps with Convex"
            className="w-full rounded-md border border-border px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Audience</span>
          <input
            value={audience}
            onChange={(e) => setAudience(e.target.value)}
            placeholder="e.g. Intermediate React developers"
            className="w-full rounded-md border border-border px-3 py-2 text-sm"
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
              className="w-full rounded-md border border-border px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Tone</span>
            <select
              value={tone}
              onChange={(e) => setTone(e.target.value)}
              className="w-full rounded-md border border-border px-3 py-2 text-sm"
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
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          <Sparkles className="h-4 w-4" /> {busy ? "Generating…" : "Generate course"}
        </button>
      </div>
    </div>
  );
}
