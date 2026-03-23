/**
 * AuditClearDialog Component
 *
 * Confirmation dialog for clearing audit entries (destructive action).
 * Acceptable popup (not content management).
 * Uses Base UI Dialog (NOT Radix).
 *
 * Features:
 * - Mode selection: before_date / by_severity / expired
 * - Dry run preview button
 * - "CONFIRM DELETE" safety phrase input
 */

import { useState, useCallback } from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import {
  AlertTriangleIcon,
  LoaderIcon,
  Trash2Icon,
  EyeIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuditClear } from "@/hooks/audit/useAuditMutations";
import type { AuditClearResult } from "@/lib/audit/types";

interface AuditClearDialogProps {
  open: boolean;
  onClose: () => void;
}

type ClearMode = "before_date" | "by_severity" | "expired";

export function AuditClearDialog({ open, onClose }: AuditClearDialogProps) {
  const { clear, isClearing } = useAuditClear();

  const [mode, setMode] = useState<ClearMode>("expired");
  const [beforeDateStr, setBeforeDateStr] = useState("");
  const [severity, setSeverity] = useState<"informational" | "low">(
    "informational",
  );
  const [confirmPhrase, setConfirmPhrase] = useState("");
  const [dryRunResult, setDryRunResult] = useState<AuditClearResult | null>(
    null,
  );

  const beforeDateMs = beforeDateStr
    ? new Date(beforeDateStr).getTime()
    : undefined;

  // 30 days ago for validation display
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const handleDryRun = useCallback(async () => {
    const result = await clear({
      mode,
      beforeDate: mode === "before_date" ? beforeDateMs : undefined,
      severity: mode === "by_severity" ? severity : undefined,
      dryRun: true,
    });

    if (result) {
      setDryRunResult(result);
    }
  }, [clear, mode, beforeDateMs, severity]);

  const handleClear = useCallback(async () => {
    const result = await clear({
      mode,
      beforeDate: mode === "before_date" ? beforeDateMs : undefined,
      severity: mode === "by_severity" ? severity : undefined,
      dryRun: false,
      confirmPhrase,
    });

    if (result && !result.isDryRun) {
      // Success - close dialog
      handleClose();
    }
  }, [clear, mode, beforeDateMs, severity, confirmPhrase]);

  const handleClose = useCallback(() => {
    setDryRunResult(null);
    setConfirmPhrase("");
    onClose();
  }, [onClose]);

  const isConfirmValid = confirmPhrase === "CONFIRM DELETE";
  const isModeValid =
    mode === "expired" ||
    (mode === "before_date" && beforeDateMs) ||
    (mode === "by_severity" && severity);

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(open) => !open && handleClose()}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/40 data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0" />
        <DialogPrimitive.Popup
          role="alertdialog"
          className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-full max-w-md rounded-none border border-border bg-card p-6 shadow-lg data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95"
        >
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-none bg-destructive/10">
              <AlertTriangleIcon className="size-5 text-destructive" />
            </div>
            <div className="flex-1">
              <DialogPrimitive.Title className="text-sm font-semibold text-foreground">
                Clear Audit Log
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-1 text-xs text-muted-foreground">
                Permanently delete audit entries. This action cannot be undone.
              </DialogPrimitive.Description>
            </div>
          </div>

          <div className="mt-4 space-y-4">
            {/* Mode selection */}
            <div>
              <label className="text-xs font-medium text-foreground block mb-1.5">
                Clear Mode
              </label>
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="clearMode"
                    value="expired"
                    checked={mode === "expired"}
                    onChange={() => {
                      setMode("expired");
                      setDryRunResult(null);
                    }}
                    className="accent-primary"
                  />
                  <span className="text-xs text-foreground">
                    Expired entries
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    (past retention period)
                  </span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="clearMode"
                    value="before_date"
                    checked={mode === "before_date"}
                    onChange={() => {
                      setMode("before_date");
                      setDryRunResult(null);
                    }}
                    className="accent-primary"
                  />
                  <span className="text-xs text-foreground">
                    Before date
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    (min 30 days ago)
                  </span>
                </label>

                {mode === "before_date" && (
                  <div className="ml-5">
                    <input
                      type="date"
                      className="h-7 text-xs border border-border rounded-none px-2 bg-background text-foreground"
                      value={beforeDateStr}
                      max={thirtyDaysAgo.toISOString().split("T")[0]}
                      onChange={(e) => {
                        setBeforeDateStr(e.target.value);
                        setDryRunResult(null);
                      }}
                    />
                  </div>
                )}

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="clearMode"
                    value="by_severity"
                    checked={mode === "by_severity"}
                    onChange={() => {
                      setMode("by_severity");
                      setDryRunResult(null);
                    }}
                    className="accent-primary"
                  />
                  <span className="text-xs text-foreground">
                    By severity
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    (informational or low only)
                  </span>
                </label>

                {mode === "by_severity" && (
                  <div className="ml-5">
                    <select
                      className="h-7 text-xs border border-border rounded-none px-2 bg-background text-foreground"
                      value={severity}
                      onChange={(e) => {
                        setSeverity(
                          e.target.value as "informational" | "low",
                        );
                        setDryRunResult(null);
                      }}
                    >
                      <option value="informational">Informational</option>
                      <option value="low">Low</option>
                    </select>
                  </div>
                )}
              </div>
            </div>

            {/* Dry run preview */}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleDryRun}
                disabled={isClearing || !isModeValid}
              >
                {isClearing ? (
                  <LoaderIcon className="size-3 animate-spin mr-1" />
                ) : (
                  <EyeIcon className="size-3 mr-1" />
                )}
                Preview
              </Button>
              {dryRunResult && (
                <span className="text-xs text-muted-foreground">
                  {dryRunResult.deletedCount} entries would be deleted
                </span>
              )}
            </div>

            {/* Confirmation phrase */}
            <div>
              <label className="text-xs font-medium text-foreground block mb-1.5">
                Type <code className="text-destructive">CONFIRM DELETE</code>{" "}
                to proceed
              </label>
              <input
                type="text"
                className="w-full h-8 px-2 text-xs border border-border rounded-none bg-background text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-ring"
                placeholder="CONFIRM DELETE"
                value={confirmPhrase}
                onChange={(e) => setConfirmPhrase(e.target.value)}
              />
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleClose}
                disabled={isClearing}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleClear}
                disabled={isClearing || !isConfirmValid || !isModeValid}
              >
                {isClearing ? (
                  <>
                    <LoaderIcon className="size-3 animate-spin mr-1" />
                    Clearing...
                  </>
                ) : (
                  <>
                    <Trash2Icon className="size-3 mr-1" />
                    Clear Entries
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
