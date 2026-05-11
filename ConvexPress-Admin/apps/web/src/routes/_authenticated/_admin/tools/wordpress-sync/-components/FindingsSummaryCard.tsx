/**
 * Findings Summary Card
 *
 * Shows finding counts by severity and top issue codes
 * from the reconciliation phase of a sync report.
 */

import { AlertCircle, AlertTriangle, Info } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface FindingsSummaryCardProps {
  findingSummary: string | null;
}

interface FindingSummaryData {
  bySeverity?: Record<string, number>;
  byCode?: Record<string, number>;
}

export function FindingsSummaryCard({
  findingSummary,
}: FindingsSummaryCardProps) {
  if (!findingSummary) return null;

  let summary: FindingSummaryData;
  try {
    summary = JSON.parse(findingSummary);
  } catch {
    return null;
  }

  const { bySeverity = {}, byCode = {} } = summary;
  const totalFindings =
    (bySeverity.error || 0) +
    (bySeverity.warning || 0) +
    (bySeverity.info || 0);

  if (totalFindings === 0) return null;

  const topCodes = Object.entries(byCode)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Findings</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex gap-4 mb-3 text-sm">
          <div className="flex items-center gap-1.5">
            <AlertCircle className="w-4 h-4 text-red-500" />
            <span>{bySeverity.error || 0} errors</span>
          </div>
          <div className="flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <span>{bySeverity.warning || 0} warnings</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Info className="w-4 h-4 text-blue-500" />
            <span>{bySeverity.info || 0} info</span>
          </div>
        </div>
        {topCodes.length > 0 && (
          <div className="space-y-1">
            <h4 className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
              Top Issues
            </h4>
            {topCodes.map(([code, count]) => (
              <div key={code} className="flex justify-between text-sm">
                <span className="font-mono text-xs">{code}</span>
                <span className="text-muted-foreground tabular-nums">
                  {count}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
