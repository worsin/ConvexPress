/**
 * Widget AI Answer View.
 *
 * Displays the AI-generated answer with source articles.
 * Provides "Did this help?" feedback buttons.
 * If not helpful, guides the user to create a ticket.
 */

import { useState, useEffect, useRef } from "react";
import { useAction, useMutation } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";
import {
  Sparkles,
  ThumbsUp,
  ThumbsDown,
  BookOpen,
  ExternalLink,
  Loader2,
  CheckCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface AIAnswerResult {
  answer: string;
  sourceArticles: Array<{
    id: string;
    title: string;
    slug: string;
    categorySlug?: string;
    excerpt: string;
    score: number;
  }>;
  confidence: string;
  usedAi: boolean;
}

interface AIAnswerViewProps {
  query: string;
  sessionId: string;
  onHelpful: () => void;
  onNotHelpful: () => void;
  prefetchedResult?: AIAnswerResult;
}

export function AIAnswerView({
  query,
  sessionId,
  onHelpful,
  onNotHelpful,
  prefetchedResult,
}: AIAnswerViewProps) {
  const generateAnswer = useAction(api.support.deflection.generateAnswer);
  const generateAnswerRef = useRef(generateAnswer);
  generateAnswerRef.current = generateAnswer;

  const logInteraction = useMutation(api.support.deflection.logInteraction);

  const [result, setResult] = useState<AIAnswerResult | null>(
    prefetchedResult ?? null,
  );
  const [isLoading, setIsLoading] = useState(!prefetchedResult);
  const [feedbackGiven, setFeedbackGiven] = useState(false);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clean up pending timeout on unmount to prevent calling onHelpful on unmounted component
  useEffect(() => {
    return () => {
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    };
  }, []);

  useEffect(() => {
    // If we already have a result from the search view, skip the fetch
    if (prefetchedResult) return;

    let cancelled = false;

    async function fetchAnswer() {
      setIsLoading(true);
      try {
        const res = await generateAnswerRef.current({ query, sessionId });
        if (!cancelled) setResult(res);
      } catch (err) {
        console.error("[AIAnswer] Failed:", err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    fetchAnswer();
    return () => {
      cancelled = true;
    };
  }, [query, sessionId, prefetchedResult]);

  const handleFeedback = async (helpful: boolean) => {
    setFeedbackGiven(true);

    await logInteraction({
      sessionId,
      query,
      aiResponse: result?.answer ?? "",
      kbArticleIds: result?.sourceArticles.map((a) => a.id) ?? [],
      outcome: helpful ? "helpful" : "notHelpful",
      responseLatencyMs: 0,
    });

    if (helpful) {
      // Brief delay to show thank you, then go home (ref-guarded for unmount safety)
      feedbackTimerRef.current = setTimeout(onHelpful, 1000);
    } else {
      onNotHelpful();
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Generating an answer...
        </p>
      </div>
    );
  }

  if (!result?.usedAi || !result.answer) {
    return (
      <div className="flex flex-col items-center gap-3 p-8 text-center">
        <p className="text-sm text-muted-foreground">
          No AI answer available. Try searching our help center directly.
        </p>
        <button
          type="button"
          onClick={onNotHelpful}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Create a Ticket
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* AI Answer */}
      <div className="rounded-lg border border-border bg-muted/30 p-4">
        <div className="mb-3 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="text-xs font-semibold text-primary">AI Answer</span>
        </div>
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
          {result.answer}
        </p>
      </div>

      {/* Source Articles */}
      {result.sourceArticles.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Sources
          </h3>
          <div className="flex flex-col gap-1.5">
            {result.sourceArticles.map((article) => (
              <a
                key={article.id}
                href={article.categorySlug ? `/help/${article.categorySlug}/${article.slug}` : `/help/${article.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm",
                  "text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                )}
              >
                <BookOpen className="h-3.5 w-3.5 shrink-0" />
                <span className="flex-1 truncate">{article.title}</span>
                <ExternalLink className="h-3 w-3 shrink-0" />
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Feedback */}
      <div className="border-t border-border pt-3">
        {feedbackGiven ? (
          <div className="flex items-center justify-center gap-2 py-2">
            <CheckCircle className="h-4 w-4 text-primary" />
            <span className="text-sm text-muted-foreground">
              Thank you for your feedback!
            </span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <p className="text-sm font-medium text-foreground">
              Did this answer your question?
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => void handleFeedback(true)}
                className={cn(
                  "flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm",
                  "transition-colors hover:border-primary hover:bg-primary/5 hover:text-primary",
                )}
              >
                <ThumbsUp className="h-4 w-4" />
                Yes, helpful
              </button>
              <button
                type="button"
                onClick={() => void handleFeedback(false)}
                className={cn(
                  "flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm",
                  "transition-colors hover:border-destructive hover:bg-destructive/5 hover:text-destructive",
                )}
              >
                <ThumbsDown className="h-4 w-4" />
                No, I need help
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
