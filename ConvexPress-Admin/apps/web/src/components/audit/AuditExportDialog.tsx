/**
 * AuditExportDialog Component
 *
 * Export configuration dialog. Acceptable popup (not content management).
 * Uses Base UI Dialog (NOT Radix).
 *
 * Format selection: CSV / JSON
 * Date range filter
 * Max records slider/input
 * Include raw payload toggle
 * Shows download link on completion.
 */

import { useState, useCallback } from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { DownloadIcon, LoaderIcon, FileTextIcon, CheckCircleIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuditExport } from "@/hooks/audit/useAuditMutations";
import type { AuditSeverity, AuditObjectType, AuditExportResult } from "@/lib/audit/types";
import { formatFileSize, formatExportFileName } from "@/lib/audit/formatters";
import { DEFAULT_EXPORT_RECORDS, MAX_EXPORT_RECORDS } from "@/lib/audit/constants";

const VALID_SEVERITIES: Set<string> = new Set(["critical", "high", "medium", "low", "informational"]);
const VALID_OBJECT_TYPES: Set<string> = new Set(["post", "page", "comment", "media", "user", "role", "taxonomy", "menu", "settings", "seo", "api", "notification", "system"]);

function asSeverity(val?: string): AuditSeverity | undefined {
  return val && VALID_SEVERITIES.has(val) ? (val as AuditSeverity) : undefined;
}

function asObjectType(val?: string): AuditObjectType | undefined {
  return val && VALID_OBJECT_TYPES.has(val) ? (val as AuditObjectType) : undefined;
}

interface AuditExportDialogProps {
  open: boolean;
  onClose: () => void;
  /** Current filters to pre-populate */
  currentFilters?: {
    severity?: string;
    objectType?: string;
    actorId?: string;
    eventCode?: string;
    dateFrom?: string;
    dateTo?: string;
  };
}

export function AuditExportDialog({
  open,
  onClose,
  currentFilters,
}: AuditExportDialogProps) {
  const { exportLog, isExporting } = useAuditExport();

  const [format, setFormat] = useState<"csv" | "json">("csv");
  const [maxRecords, setMaxRecords] = useState(DEFAULT_EXPORT_RECORDS);
  const [includePayload, setIncludePayload] = useState(false);
  const [result, setResult] = useState<AuditExportResult | null>(null);

  const handleExport = useCallback(async () => {
    const exportResult = await exportLog({
      format,
      maxRecords,
      includePayload,
      severity: asSeverity(currentFilters?.severity),
      objectType: asObjectType(currentFilters?.objectType),
      actorId: currentFilters?.actorId,
      eventCode: currentFilters?.eventCode,
      dateFrom: currentFilters?.dateFrom
        ? Number(currentFilters.dateFrom)
        : undefined,
      dateTo: currentFilters?.dateTo
        ? Number(currentFilters.dateTo)
        : undefined,
    });

    if (exportResult) {
      setResult(exportResult);
    }
  }, [format, maxRecords, includePayload, currentFilters, exportLog]);

  const handleClose = useCallback(() => {
    setResult(null);
    onClose();
  }, [onClose]);

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(open) => !open && handleClose()}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/40 data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0" />
        <DialogPrimitive.Popup className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-full max-w-md rounded-none border border-border bg-card p-6 shadow-lg data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95">
          <DialogPrimitive.Title className="text-sm font-semibold text-foreground">
            Export Audit Log
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="mt-1 text-xs text-muted-foreground">
            Generate a downloadable file of audit entries with current filters
            applied.
          </DialogPrimitive.Description>

          {result ? (
            // Success state
            <div className="mt-4 space-y-4">
              <div className="flex items-center gap-3 p-3 border border-border rounded-none bg-primary/5">
                <CheckCircleIcon className="size-5 text-primary shrink-0" />
                <div>
                  <p className="text-xs font-medium text-foreground">
                    Export complete
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {result.recordCount} records ({formatFileSize(result.fileSize)})
                  </p>
                </div>
              </div>

              <a
                href={result.url}
                download={result.fileName}
                className="flex items-center gap-2 w-full px-3 py-2 text-xs font-medium text-primary bg-primary/10 hover:bg-primary/15 border border-primary/20 rounded-none transition-colors"
              >
                <DownloadIcon className="size-3.5" />
                Download {result.fileName}
              </a>

              <div className="flex justify-end">
                <Button variant="outline" size="sm" onClick={handleClose}>
                  Close
                </Button>
              </div>
            </div>
          ) : (
            // Config form
            <div className="mt-4 space-y-4">
              {/* Format selection */}
              <div>
                <label className="text-xs font-medium text-foreground block mb-1.5">
                  Format
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 text-xs border rounded-none transition-colors",
                      format === "csv"
                        ? "border-primary bg-primary/5 text-foreground"
                        : "border-border text-muted-foreground hover:text-foreground",
                    )}
                    onClick={() => setFormat("csv")}
                  >
                    <FileTextIcon className="size-3.5" />
                    CSV
                  </button>
                  <button
                    type="button"
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 text-xs border rounded-none transition-colors",
                      format === "json"
                        ? "border-primary bg-primary/5 text-foreground"
                        : "border-border text-muted-foreground hover:text-foreground",
                    )}
                    onClick={() => setFormat("json")}
                  >
                    <FileTextIcon className="size-3.5" />
                    JSON
                  </button>
                </div>
              </div>

              {/* Max records */}
              <div>
                <label className="text-xs font-medium text-foreground block mb-1.5">
                  Max Records:{" "}
                  <span className="font-normal text-muted-foreground">
                    {maxRecords.toLocaleString()}
                  </span>
                </label>
                <input
                  type="range"
                  min={100}
                  max={MAX_EXPORT_RECORDS}
                  step={100}
                  value={maxRecords}
                  onChange={(e) => setMaxRecords(Number(e.target.value))}
                  className="w-full accent-primary"
                />
                <div className="flex justify-between text-[11px] text-muted-foreground mt-0.5">
                  <span>100</span>
                  <span>{MAX_EXPORT_RECORDS.toLocaleString()}</span>
                </div>
              </div>

              {/* Include payload */}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="includePayload"
                  checked={includePayload}
                  onChange={(e) => setIncludePayload(e.target.checked)}
                  className="accent-primary"
                />
                <label
                  htmlFor="includePayload"
                  className="text-xs text-foreground cursor-pointer"
                >
                  Include raw payload data
                </label>
                <span className="text-[11px] text-muted-foreground">
                  (larger file)
                </span>
              </div>

              {/* Active filters notice */}
              {currentFilters &&
                Object.values(currentFilters).some(Boolean) && (
                  <div className="text-[11px] text-muted-foreground bg-muted/50 px-3 py-2 rounded-none border border-border">
                    Current filters will be applied to the export.
                  </div>
                )}

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleClose}
                  disabled={isExporting}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleExport}
                  disabled={isExporting}
                >
                  {isExporting ? (
                    <>
                      <LoaderIcon className="size-3 animate-spin mr-1" />
                      Exporting...
                    </>
                  ) : (
                    <>
                      <DownloadIcon className="size-3 mr-1" />
                      Export
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
