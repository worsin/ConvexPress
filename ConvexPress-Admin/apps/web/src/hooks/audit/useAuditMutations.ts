/**
 * useAuditMutations Hook
 *
 * Wraps clear mutation and export action with toast notifications
 * and loading state management.
 */

import { useState, useCallback } from "react";
import { useMutation, useAction } from "convex/react";
import { toast } from "sonner";

import { api } from "@backend/convex/_generated/api";
import type {
  AuditClearOptions,
  AuditClearResult,
  AuditExportOptions,
  AuditExportResult,
} from "@/lib/audit/types";
import { formatFileSize } from "@/lib/audit/formatters";

// ─── Clear Hook ─────────────────────────────────────────────────────────────

export function useAuditClear() {
  const [isClearing, setIsClearing] = useState(false);
  const clearMutation = useMutation(api.auditLogs.mutations.clear);

  const clear = useCallback(
    async (options: AuditClearOptions): Promise<AuditClearResult | null> => {
      setIsClearing(true);
      try {
        const result = (await clearMutation(options)) as AuditClearResult;

        if (options.dryRun) {
          toast.info(
            `Preview: ${result.deletedCount} entries would be deleted.`,
          );
        } else {
          toast.success(
            `Deleted ${result.deletedCount} audit entries.`,
          );
        }

        return result;
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Failed to clear audit log";
        toast.error(message);
        return null;
      } finally {
        setIsClearing(false);
      }
    },
    [clearMutation],
  );

  return { clear, isClearing };
}

// ─── Export Hook ────────────────────────────────────────────────────────────

export function useAuditExport() {
  const [isExporting, setIsExporting] = useState(false);
  const exportAction = useAction(api.auditLogs.actions.exportAuditLog);

  const exportLog = useCallback(
    async (options: AuditExportOptions): Promise<AuditExportResult | null> => {
      setIsExporting(true);
      try {
        const result = (await exportAction(options)) as AuditExportResult;

        toast.success(
          `Exported ${result.recordCount} records (${formatFileSize(result.fileSize)})`,
        );

        return result;
      } catch (error: unknown) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to export audit log";
        toast.error(message);
        return null;
      } finally {
        setIsExporting(false);
      }
    },
    [exportAction],
  );

  return { exportLog, isExporting };
}
