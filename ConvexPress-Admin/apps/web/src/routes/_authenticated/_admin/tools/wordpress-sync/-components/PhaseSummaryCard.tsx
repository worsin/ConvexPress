/**
 * Phase Summary Card
 *
 * Shows per-phase imported/failed counts from a sync report.
 * The phaseCounts field is a JSON string stored in the report.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface PhaseSummaryCardProps {
  phaseCounts: string | null;
}

const PHASE_LABELS: Record<string, string> = {
  users: "Users",
  categories: "Categories",
  tags: "Tags",
  media: "Media Library",
  posts: "Posts",
  pages: "Pages",
  comments: "Comments",
  menus: "Navigation Menus",
  commerceCatalog: "Product Catalog",
  commerceTransactions: "Orders & Customers",
  reconciliation: "Reconciliation",
  cleanup: "Validation",
};

interface PhaseData {
  imported?: number;
  failed?: number;
  total?: number;
  skipped?: number;
}

export function PhaseSummaryCard({ phaseCounts }: PhaseSummaryCardProps) {
  if (!phaseCounts) return null;

  let counts: Record<string, PhaseData>;
  try {
    counts = JSON.parse(phaseCounts);
  } catch {
    return null;
  }

  const entries = Object.entries(counts).filter(([, data]) => {
    const imported = data?.imported || 0;
    const total = data?.total || 0;
    return total > 0 || imported > 0;
  });

  if (entries.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Phase Summary</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-1.5">
          {entries.map(([phase, data]) => {
            const imported = data?.imported || 0;
            const failed = data?.failed || 0;
            return (
              <div key={phase} className="flex justify-between text-sm">
                <span>{PHASE_LABELS[phase] || phase}</span>
                <span className="text-muted-foreground tabular-nums">
                  {imported} imported
                  {failed > 0 ? `, ${failed} failed` : ""}
                </span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
