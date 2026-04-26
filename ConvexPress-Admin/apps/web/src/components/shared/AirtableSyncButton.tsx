/**
 * AirtableSyncButton
 *
 * A reusable button that triggers an Airtable sync action and displays
 * toast feedback with sync results (created/updated/errors).
 *
 * Usage:
 *   <AirtableSyncButton syncAction={api.airtableSync.actions.syncRoles} />
 */

import { useState } from "react";
import { useAction } from "convex/react";
import type { FunctionReference } from "convex/server";
import { RefreshCwIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

interface SyncResult {
  success: boolean;
  total: number;
  created: number;
  updated: number;
  unchanged: number;
  errors?: string[];
}

interface AirtableSyncButtonProps {
  /** The Convex action reference to call (e.g., api.airtableSync.actions.syncRoles) */
  syncAction: FunctionReference<"action">;
  /** Button label. Default: "Sync from Airtable" */
  label?: string;
}

export function AirtableSyncButton({
  syncAction,
  label = "Sync from Airtable",
}: AirtableSyncButtonProps) {
  const [isSyncing, setIsSyncing] = useState(false);
  const runSync = useAction(syncAction);

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const result = (await runSync({})) as SyncResult;

      if (result.success) {
        const parts: string[] = [];
        if (result.created > 0) parts.push(`${result.created} created`);
        if (result.updated > 0) parts.push(`${result.updated} updated`);
        if (result.unchanged > 0) parts.push(`${result.unchanged} unchanged`);

        const message =
          parts.length > 0
            ? `Synced ${result.total} records: ${parts.join(", ")}`
            : `Synced ${result.total} records`;

        toast.success(message);

        if (result.errors && result.errors.length > 0) {
          toast.warning(`${result.errors.length} warning(s) during sync`, {
            description: result.errors.slice(0, 3).join("\n"),
          });
        }
      } else {
        toast.error("Sync failed");
      }
    } catch (e) {
      toast.error("Sync failed", {
        description: e instanceof Error ? e.message : "Unknown error",
      });
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={handleSync}
      disabled={isSyncing}
    >
      <RefreshCwIcon
        className={`size-3.5 mr-1.5 ${isSyncing ? "animate-spin" : ""}`}
      />
      {isSyncing ? "Syncing..." : label}
    </Button>
  );
}
