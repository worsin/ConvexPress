/**
 * useSeoAnalysis - Client-side SEO analysis engine hook.
 *
 * Runs 14 SEO checks with weighted scoring (0-100).
 * Debounced 1 second after typing stops.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { runSeoAnalysis } from "@/lib/seo/analysis";
import type { AnalysisResult } from "@/lib/seo/types";

interface UseSeoAnalysisOpts {
  content: string;
  title: string;
  slug: string;
  excerpt: string;
  focusKeyphrase: string;
  metaTitle: string;
  metaDescription: string;
  isDuplicateKeyphrase?: boolean;
  debounceMs?: number;
}

export function useSeoAnalysis(opts: UseSeoAnalysisOpts): AnalysisResult | null {
  const {
    content,
    title,
    slug,
    excerpt,
    focusKeyphrase,
    metaTitle,
    metaDescription,
    isDuplicateKeyphrase = false,
    debounceMs = 1000,
  } = opts;

  const [result, setResult] = useState<AnalysisResult | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runAnalysis = useCallback(() => {
    const analysisResult = runSeoAnalysis({
      content,
      title,
      slug,
      excerpt,
      focusKeyphrase,
      metaTitle,
      metaDescription,
      isDuplicateKeyphrase,
    });
    setResult(analysisResult);
  }, [content, title, slug, excerpt, focusKeyphrase, metaTitle, metaDescription, isDuplicateKeyphrase]);

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
