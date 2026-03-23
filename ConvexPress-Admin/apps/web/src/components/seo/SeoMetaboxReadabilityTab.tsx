/**
 * SeoMetaboxReadabilityTab - Readability analysis tab in the metabox.
 *
 * Shows readability score badge and analysis check results.
 */

import { SeoScoreBadge } from "./SeoScoreBadge";
import { SeoAnalysisResults } from "./SeoAnalysisResults";
import type { ReadabilityAnalysisResult } from "@/lib/seo/types";

interface SeoMetaboxReadabilityTabProps {
  analysisResult: ReadabilityAnalysisResult | null;
}

export function SeoMetaboxReadabilityTab({
  analysisResult,
}: SeoMetaboxReadabilityTabProps) {
  if (!analysisResult) {
    return (
      <div className="py-6 text-center">
        <p className="text-xs text-muted-foreground">
          Analyzing readability...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Score badge */}
      <SeoScoreBadge
        score={analysisResult.score}
        label={`Readability: ${analysisResult.score}/100`}
      />

      {/* Analysis results */}
      <SeoAnalysisResults
        checks={analysisResult.checks}
        title="Readability Analysis"
      />
    </div>
  );
}
