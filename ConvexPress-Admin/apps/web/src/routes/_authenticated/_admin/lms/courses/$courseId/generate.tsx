/**
 * AI Course Generation — /lms/courses/$courseId/generate
 *
 * Brief wizard UI. The generation backend (convex/lms/ai, mirroring
 * convex/ai's Claude+Tavily pipeline) + ANTHROPIC_API_KEY / TAVILY_API_KEY
 * are the next step; this screen captures the brief and explains the flow.
 */

import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Sparkles, Info } from "lucide-react";

export const Route = createFileRoute(
  "/_authenticated/_admin/lms/courses/$courseId/generate",
)({
  component: GeneratePage,
});

function GeneratePage() {
  const { courseId } = Route.useParams();
  const [topic, setTopic] = useState("");
  const [audience, setAudience] = useState("");
  const [topics, setTopics] = useState(5);
  const [tone, setTone] = useState("professional");

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
          Outline-first generation runs Claude + Tavily, then writes lesson
          bodies asynchronously. Connect{" "}
          <code className="rounded bg-muted px-1">ANTHROPIC_API_KEY</code> and{" "}
          <code className="rounded bg-muted px-1">TAVILY_API_KEY</code> in
          Settings → AI Providers to enable generation.
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
              max={20}
              value={topics}
              onChange={(e) => setTopics(Number(e.target.value))}
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
          disabled
          title="Requires ANTHROPIC_API_KEY + TAVILY_API_KEY"
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground opacity-50"
        >
          <Sparkles className="h-4 w-4" /> Generate outline
        </button>
      </div>
    </div>
  );
}
