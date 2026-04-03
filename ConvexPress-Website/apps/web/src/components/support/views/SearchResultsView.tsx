/**
 * Widget Search Results View.
 *
 * Shows KB article search results from the AI deflection action.
 * Includes an AI-generated answer (if available) and a "Still need help?" CTA.
 */

import { useState, useEffect, useRef } from "react";
import { useAction } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";
import {
  BookOpen,
  ExternalLink,
  Sparkles,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface AIResult {
  answer: string;
  sourceArticles: Array<{
    id: string;
    title: string;
    slug: string;
    excerpt: string;
    categorySlug?: string;
    score: number;
    source: string;
  }>;
  confidence: string;
  usedAi: boolean;
  error?: string;
}

interface SearchResultsViewProps {
  query: string;
  sessionId: string;
  onSelectArticle: (categorySlug: string, slug: string) => void;
  onAIAnswer: (result: AIResult) => void;
  onStillNeedHelp: () => void;
}

export function SearchResultsView({
  query,
  sessionId,
  onSelectArticle,
  onAIAnswer,
  onStillNeedHelp,
}: SearchResultsViewProps) {
  const generateAnswer = useAction(api.support.deflection.generateAnswer);
  const generateAnswerRef = useRef(generateAnswer);
  generateAnswerRef.current = generateAnswer;

  const [result, setResult] = useState<AIResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function doSearch() {
      setIsLoading(true);
      setError(null);
      try {
        const res = await generateAnswerRef.current({ query, sessionId });
        if (!cancelled) {
          setResult(res);
        }
      } catch (err) {
        if (!cancelled) {
          setError("Failed to search. Please try again.");
          console.error("[SupportWidget] Search failed:", err);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    doSearch();
    return () => {
      cancelled = true;
    };
  }, [query, sessionId]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Searching for answers...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 p-8 text-center">
        <AlertCircle className="h-6 w-6 text-destructive" />
        <p className="text-sm text-destructive">{error}</p>
        <button
          type="button"
          onClick={onStillNeedHelp}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Create a Ticket
        </button>
      </div>
    );
  }

  const hasArticles = result && result.sourceArticles.length > 0;
  const hasAIAnswer = result?.usedAi && result.answer;

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* AI Answer */}
      {hasAIAnswer && (
        <div className="rounded-lg border border-border bg-muted/30 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-xs font-medium text-primary">AI Answer</span>
            </div>
            <button
              type="button"
              onClick={() => result && onAIAnswer(result)}
              className="text-xs text-primary hover:underline"
            >
              View full answer
            </button>
          </div>
          <p className="text-sm leading-relaxed text-foreground">
            {result.answer}
          </p>
        </div>
      )}

      {/* Source Articles */}
      {hasArticles && (
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Related Articles
          </h3>
          <div className="flex flex-col gap-2">
            {result.sourceArticles.map((article) => (
              <button
                key={article.id}
                type="button"
                onClick={() => onSelectArticle(article.categorySlug ?? "", article.slug)}
                className={cn(
                  "flex items-start gap-3 rounded-lg border border-border p-3 text-left",
                  "transition-colors hover:bg-muted/50",
                )}
              >
                <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">
                    {article.title}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                    {article.excerpt}
                  </p>
                </div>
                <ExternalLink className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* No results */}
      {!hasArticles && !hasAIAnswer && (
        <div className="py-4 text-center">
          <p className="text-sm text-muted-foreground">
            No articles found for "{query}".
          </p>
        </div>
      )}

      {/* Still need help */}
      <div className="border-t border-border pt-3">
        <button
          type="button"
          onClick={onStillNeedHelp}
          className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          I still need help
        </button>
      </div>
    </div>
  );
}
