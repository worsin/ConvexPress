/**
 * PageGenerationPrompt — the "✨ Generate page from prompt" surface that
 * lives above the BlockOutline. This is the headline product feature: the
 * user types a sentence describing what they want, the AI emits a sequence
 * of blocks, the page renders.
 *
 * The Convex action `blocks/ai:generatePage` does the heavy lifting; this
 * component is purely UI + capability gating.
 */

import { Sparkles } from "lucide-react";
import { useState } from "react";
import { useAction, useMutation } from "convex/react";
import { toast } from "sonner";

import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import type { ConvexPressBlock } from "@/lib/blocks/types";
import { getBlockDefinition } from "@/lib/blocks/registry";

interface PageGenerationPromptProps {
  postId: string;
  pageType: "post" | "page";
  /** Pass through so we can ask for the right revision on save. */
  expectedRevision: number;
  /** Number of existing blocks — used to choose between "Generate" and "Replace" labels. */
  existingBlockCount: number;
}

export function PageGenerationPrompt({
  postId,
  pageType,
  expectedRevision,
  existingBlockCount,
}: PageGenerationPromptProps) {
  const [prompt, setPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [expanded, setExpanded] = useState(existingBlockCount === 0);
  const [draftBlocks, setDraftBlocks] = useState<ConvexPressBlock[] | null>(null);

  const generatePage = useAction((api as any).blocks.ai.generatePage);
  const generatePageDraft = useAction((api as any).blocks.ai.generatePageDraft);
  const replaceBlocks = useMutation(api.blocks.mutations.replaceBlocks);

  const isReplace = existingBlockCount > 0;

  const handleGenerate = async () => {
    const trimmed = prompt.trim();
    if (!trimmed) {
      toast.error("Enter a prompt describing the page you want.");
      return;
    }
    if (isReplace) {
      setIsGenerating(true);
      try {
        const result = await generatePageDraft({
          postId: postId as Id<"posts">,
          prompt: trimmed,
          pageType,
        });
        setDraftBlocks(result.blocks as ConvexPressBlock[]);
        toast.success(`Generated ${result.blocksGenerated} draft blocks for preview.`);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Generation failed";
        toast.error(message);
      } finally {
        setIsGenerating(false);
      }
      return;
    }
    setIsGenerating(true);
    try {
      const result = await generatePage({
        postId: postId as Id<"posts">,
        prompt: trimmed,
        pageType,
        expectedRevision,
      });
      toast.success(`Generated ${result.blocksGenerated} blocks.`);
      setPrompt("");
      setExpanded(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Generation failed";
      toast.error(message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleApplyDraft = async () => {
    if (!draftBlocks) return;
    setIsGenerating(true);
    try {
      await replaceBlocks({
        postId: postId as Id<"posts">,
        blocks: draftBlocks,
        expectedRevision,
      });
      toast.success(`Replaced page with ${draftBlocks.length} AI-generated blocks.`);
      setDraftBlocks(null);
      setPrompt("");
      setExpanded(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to apply generated page";
      toast.error(message);
    } finally {
      setIsGenerating(false);
    }
  };

  // Compact button when collapsed.
  if (!expanded) {
    return (
      <div className="flex items-center justify-between border border-border bg-card px-3 py-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Sparkles className="size-3.5 text-primary" />
          <span>AI can generate or replace this page from a prompt.</span>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setExpanded(true)}
          className="gap-1.5"
        >
          <Sparkles className="size-3.5" />
          Generate with AI
        </Button>
      </div>
    );
  }

  return (
    <div className="border border-primary/30 bg-primary/5 p-3 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">
            {isReplace ? "Replace this page with AI-generated content" : "Generate this page with AI"}
          </h3>
        </div>
        {existingBlockCount > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Hide
          </button>
        )}
      </div>
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder={
          pageType === "post"
            ? "Describe the blog post you want. E.g.: \"A 600-word post about why structured content beats free-form for AI-assisted authoring, with an intro, three subsections, and a closing thought.\""
            : "Describe the page you want. E.g.: \"A pricing page for a SaaS PM tool with 3 tiers, a feature comparison grid, 3 testimonials, an FAQ, and a closing CTA.\""
        }
        rows={4}
        disabled={isGenerating}
        className="w-full border border-border bg-background px-3 py-2 text-sm text-foreground outline-hidden focus:border-primary disabled:cursor-not-allowed disabled:opacity-60"
      />
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] text-muted-foreground">
          The skill/theme handles all visual styling — you only describe what should be on the page.
        </p>
        <div className="flex items-center gap-2">
          {!isReplace && existingBlockCount === 0 && (
            <span className="text-[10px] text-muted-foreground">Empty page</span>
          )}
          <Button
            type="button"
            size="sm"
            onClick={handleGenerate}
            disabled={isGenerating || !prompt.trim()}
            className="gap-1.5"
          >
            <Sparkles className="size-3.5" />
            {isGenerating
              ? "Generating…"
              : isReplace
                ? `Replace ${existingBlockCount} block${existingBlockCount === 1 ? "" : "s"}`
                : "Generate page"}
          </Button>
        </div>
      </div>
      {draftBlocks && (
        <GeneratedBlocksPreview
          blocks={draftBlocks}
          isApplying={isGenerating}
          onApply={handleApplyDraft}
          onDiscard={() => setDraftBlocks(null)}
        />
      )}
    </div>
  );
}

function GeneratedBlocksPreview({
  blocks,
  isApplying,
  onApply,
  onDiscard,
}: {
  blocks: ConvexPressBlock[];
  isApplying: boolean;
  onApply: () => void;
  onDiscard: () => void;
}) {
  return (
    <div className="border border-border bg-card p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h4 className="text-xs font-semibold text-foreground">
            Preview generated replacement
          </h4>
          <p className="mt-1 text-[10px] text-muted-foreground">
            Review the outline before it replaces the current page.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" variant="outline" disabled={isApplying} onClick={onDiscard}>
            Discard
          </Button>
          <Button type="button" size="sm" disabled={isApplying} onClick={onApply}>
            {isApplying ? "Applying..." : "Apply replacement"}
          </Button>
        </div>
      </div>
      <ol className="max-h-56 space-y-1 overflow-y-auto border border-border bg-background p-2">
        {blocks.map((block, index) => {
          const definition = getBlockDefinition(block.name);
          return (
            <li key={block.id} className="flex items-center gap-2 text-xs">
              <span className="w-6 shrink-0 text-right font-mono text-muted-foreground">
                {index + 1}
              </span>
              <span className="font-medium text-foreground">
                {definition?.title ?? block.name}
              </span>
              <span className="truncate text-muted-foreground">
                {summarizeBlockAttrs(block.attrs)}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function summarizeBlockAttrs(attrs: Record<string, unknown>) {
  for (const key of ["title", "heading", "text", "body", "url"]) {
    const value = attrs[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim().length > 80 ? `${value.trim().slice(0, 79)}...` : value.trim();
    }
  }
  return "";
}
