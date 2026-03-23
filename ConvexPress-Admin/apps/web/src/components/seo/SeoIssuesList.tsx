/**
 * SeoIssuesList - Actionable SEO issues from the overview data.
 */

import { AlertCircle, FileText, Search, EyeOff } from "lucide-react";

interface SeoIssuesListProps {
  missingDescription: number;
  missingKeyphrase: number;
  noindexCount: number;
  totalPublished: number;
}

export function SeoIssuesList({
  missingDescription,
  missingKeyphrase,
  noindexCount,
  totalPublished,
}: SeoIssuesListProps) {
  const issues = [
    {
      icon: FileText,
      label: "Posts without meta description",
      count: missingDescription,
      severity: missingDescription > 0 ? "warning" : "ok",
    },
    {
      icon: Search,
      label: "Posts without focus keyphrase",
      count: missingKeyphrase,
      severity: missingKeyphrase > 0 ? "warning" : "ok",
    },
    {
      icon: EyeOff,
      label: "Posts marked noindex",
      count: noindexCount,
      severity: noindexCount > 0 ? "info" : "ok",
    },
  ];

  const hasIssues = missingDescription > 0 || missingKeyphrase > 0;

  return (
    <div className="space-y-2">
      {!hasIssues && totalPublished > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 bg-seo-good/10 border border-seo-good/20">
          <AlertCircle className="size-3.5 text-seo-good" />
          <span className="text-xs text-seo-good">No critical SEO issues found.</span>
        </div>
      )}

      {issues.map((issue) => (
        <div
          key={issue.label}
          className="flex items-center gap-2 px-3 py-2 border border-border"
        >
          <issue.icon
            className={`size-3.5 shrink-0 ${
              issue.severity === "warning"
                ? "text-seo-ok"
                : issue.severity === "info"
                  ? "text-muted-foreground"
                  : "text-seo-good"
            }`}
          />
          <span className="text-xs text-foreground flex-1">{issue.label}</span>
          <span className="text-xs font-semibold tabular-nums text-muted-foreground">
            {issue.count}
          </span>
        </div>
      ))}
    </div>
  );
}
