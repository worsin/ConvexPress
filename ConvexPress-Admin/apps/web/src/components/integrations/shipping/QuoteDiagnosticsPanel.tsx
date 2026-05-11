import { useQuery } from "convex-helpers/react/cache";
import { api } from "@backend/convex/_generated/api";

export function QuoteDiagnosticsPanel() {
  const diagnostics = useQuery(api.shipping.queries.getRecentQuoteDiagnostics, {
    limit: 25,
  });

  if (!diagnostics) {
    return <div className="text-sm text-foreground/50">Loading diagnostics...</div>;
  }

  if (diagnostics.length === 0) {
    return (
      <div className="text-sm text-foreground/50">
        No quote requests recorded yet. Diagnostics are captured when checkout rates are requested.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {diagnostics.map((diag: any) => (
        <div
          key={diag._id}
          className="rounded-lg border border-border bg-card p-4 text-sm"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="font-medium">
              {new Date(diag.requestedAt).toLocaleString()}
            </span>
            <span className="text-xs">
              {diag.totalQuotes} quote{diag.totalQuotes !== 1 ? "s" : ""} returned
              {diag.fallbackUsed && (
                <span className="ml-2 text-amber-600">(fallback used)</span>
              )}
            </span>
          </div>
          <div className="space-y-1">
            {diag.providerResults.map((pr: any) => (
              <div
                key={pr.provider}
                className="flex items-center gap-2 text-xs"
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    !pr.attempted
                      ? "bg-foreground/20"
                      : pr.success
                        ? "bg-emerald-500"
                        : "bg-red-500"
                  }`}
                />
                <span className="font-mono w-20">{pr.provider}</span>
                {pr.attempted ? (
                  <>
                    <span>
                      {pr.success
                        ? `${pr.quoteCount} quote${pr.quoteCount !== 1 ? "s" : ""}`
                        : "failed"}
                    </span>
                    {pr.durationMs !== undefined && (
                      <span className="text-foreground/40">{pr.durationMs}ms</span>
                    )}
                    {pr.errorMessage && (
                      <span className="text-red-500 truncate max-w-[300px]">
                        {pr.errorMessage}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-foreground/40">
                    skipped: {pr.skippedReason}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
