/**
 * useReadabilityAnalysis - Client-side readability analysis hook.
 *
 * Runs 8 readability checks with Flesch-based scoring.
 * Debounced 1 second after typing stops.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { runReadabilityAnalysis } from "@/lib/seo/readability";
import type { ReadabilityAnalysisResult } from "@/lib/seo/types";

interface UseReadabilityAnalysisOpts {
  content: string;
  title: string;
  debounceMs?: number;
}

export function useReadabilityAnalysis(opts: UseReadabilityAnalysisOpts): ReadabilityAnalysisResult | null {
  const { content, title, debounceMs = 1000 } = opts;

  const [result, setResult] = useState<ReadabilityAnalysisResult | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runAnalysis = useCallback(() => {
    const analysisResult = runReadabilityAnalysis({ content, title });
    setResult(analysisResult);
  }, [content, title]);

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = setTimeout(() => {
      runAnalysis();
    }, debounceMs);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [runAnalysis, debounceMs]);

  return result;
}
