/**
 * Tools > Audit Log > Entry Detail
 *
 * Full detail page for a single audit entry.
 * Shows actor context, object context, changes diff, payload viewer,
 * event processing metadata, and related entries.
 */

import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { LoaderIcon, AlertCircleIcon } from "lucide-react";

import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import type { AuditEntryDetail as AuditEntryDetailType } from "@/lib/audit/types";
import { AuditEntryDetail } from "@/components/audit/AuditEntryDetail";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute(
  "/_authenticated/_admin/tools/audit-log/$entryId",
)({
  component: AuditEntryDetailPage,
});

function AuditEntryDetailPage() {
  const { entryId } = Route.useParams();

  const entry = useQuery(api.auditLogs.queries.get, {
    entryId: entryId as Id<"auditEntries">,
  });

  // Loading state
  if (entry === undefined) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <LoaderIcon className="size-4 animate-spin mr-2" />
        Loading audit entry...
      </div>
    );
  }

  // Not found / error state
  if (entry === null) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <AlertCircleIcon className="size-8 text-muted-foreground mb-3" />
        <p className="text-sm text-foreground font-medium">
          Audit entry not found
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          This entry may have been deleted by a retention cleanup.
        </p>
        <Button
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={() => window.history.back()}
        >
          Go Back
        </Button>
      </div>
    );
  }

  return <AuditEntryDetail entry={entry as AuditEntryDetailType} />;
}
