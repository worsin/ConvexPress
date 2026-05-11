/**
 * SeoAnalysisResults - Expandable list of analysis check results.
 *
 * Shows check status icons (good/ok/poor) with labels and messages.
 */

import { useState } from "react";
import { ChevronDown, ChevronRight, Circle, CheckCircle2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SeoCheckResult, ReadabilityCheckResult } from "@/lib/seo/types";

interface SeoAnalysisResultsProps {
  checks: (SeoCheckResult | ReadabilityCheckResult)[];
  title?: string;
  defaultExpanded?: boolean;
}

export function SeoAnalysisResults({
  checks,
  title = "Analysis Results",
  defaultExpanded = true,
}: SeoAnalysisResultsProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const goodChecks = checks.filter((c) => c.status === "good");
  const okChecks = checks.filter((c) => c.status === "ok");
  const poorChecks = checks.filter((c) => c.status === "poor");

  return (
    <div className="border border-border rounded-none">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium hover:bg-muted/50 transition-colors"
      >
        <span>{title}</span>
        <div className="flex items-center gap-2">
          <span className="text-seo-good text-[10px]">{goodChecks.length}</span>
          <span className="text-seo-ok text-[10px]">{okChecks.length}</span>
          <span className="text-seo-poor text-[10px]">{poorChecks.length}</span>
          {expanded ? (
            <ChevronDown className="size-3.5 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-3.5 text-muted-foreground" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border divide-y divide-border">
          {/* Poor checks first */}
          {poorChecks.map((check) => (
            <CheckItem key={check.id} check={check} />
          ))}
          {/* OK checks */}
          {okChecks.map((check) => (
            <CheckItem key={check.id} check={check} />
          ))}
          {/* Good checks */}
          {goodChecks.map((check) => (
            <CheckItem key={check.id} check={check} />
          ))}
        </div>
      )}
    </div>
  );
}

function CheckItem({ check }: { check: SeoCheckResult | ReadabilityCheckResult }) {
  const StatusIcon =
    check.status === "good"
      ? CheckCircle2
      : check.status === "ok"
        ? Circle
        : AlertCircle;

  const iconColor =
    check.status === "good"
      ? "text-seo-good"
      : check.status === "ok"
        ? "text-seo-ok"
        : "text-seo-poor";

  return (
    <div className="flex items-start gap-2 px-3 py-2">
      <StatusIcon className={cn("size-3.5 mt-0.5 shrink-0", iconColor)} />
      <div className="min-w-0">
        <p className="text-xs font-medium text-foreground">{check.label}</p>
        <p className="text-[11px] text-muted-foreground leading-relaxed">{check.message}</p>
      </div>
    </div>
  );
}
