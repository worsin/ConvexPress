/**
 * useAiGeneration - Hook for AI content generation actions.
 * Tracks generation state, calls Convex actions, and handles errors.
 */

import { useState, useCallback } from "react";
import { useAction } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import { toast } from "sonner";
import type { Id } from "@backend/convex/_generated/dataModel";

export type GenerationStatus = "idle" | "generating" | "done" | "error";

export function useAiGeneration(postId: string | undefined) {
  const [status, setStatus] = useState<GenerationStatus>("idle");
  const [currentSection, setCurrentSection] = useState<string | null>(null);

  const generateAll = useAction(api.ai.actions.generateAll);
  const generateSection = useAction(api.ai.actions.generateSection);

  const handleGenerateAll = useCallback(async () => {
    if (!postId) return;
    setStatus("generating");
    setCurrentSection("all");
    try {
      const result = await generateAll({ postId: postId as Id<"posts"> });
      toast.success(`Generated ${result.topicCount} topics with ${result.sourceCount} sources. Reload to see changes.`);
      setStatus("done");
      window.location.reload();
    } catch (err: any) {
      console.error("AI generation error:", err);
      const msg = err?.data?.message || err?.message || "Generation failed. Check that API keys are configured.";
      toast.error(msg);
      setStatus("error");
    } finally {
      setCurrentSection(null);
    }
  }, [postId, generateAll]);

  const handleRegenerateSection = useCallback(async (
    section: "hero" | "topic" | "summary" | "sources" | "tableOfContents",
    topicIndex?: number,
  ) => {
    if (!postId) return;
    setStatus("generating");
    setCurrentSection(topicIndex !== undefined ? `topic-${topicIndex}` : section);
    try {
      await generateSection({
        postId: postId as Id<"posts">,
        section,
        topicIndex,
      });
      toast.success(`${section} regenerated. Reload to see changes.`);
      setStatus("done");
      window.location.reload();
    } catch (err: any) {
      console.error("AI section generation error:", err);
      const msg = err?.data?.message || err?.message || "Generation failed";
      toast.error(msg);
      setStatus("error");
    } finally {
      setCurrentSection(null);
    }
  }, [postId, generateSection]);

  return {
    status,
    currentSection,
    isGenerating: status === "generating",
    handleGenerateAll,
    handleRegenerateSection,
  };
}
