/**
 * Revoke Key Dialog
 *
 * Confirmation dialog for revoking an API key.
 * Includes optional reason textarea.
 *
 * Uses Base UI Dialog (NOT Radix).
 */

import { useState } from "react";
import { useMutation } from "convex/react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { AlertTriangleIcon, LoaderIcon } from "lucide-react";
import { toast } from "sonner";

import { api } from "@backend/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { cn, asId } from "@/lib/utils";

interface RevokeKeyDialogProps {
  open: boolean;
  onClose: () => void;
  keyId: string;
  keyName: string;
  keyPrefix: string;
}

export function RevokeKeyDialog({
  open,
  onClose,
  keyId,
  keyName,
  keyPrefix,
}: RevokeKeyDialogProps) {
  const revokeKey = useMutation(api.api.mutations.revokeKey);
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleRevoke = async () => {
    setIsSubmitting(true);
    try {
      await revokeKey({
        keyId: asId<"apiKeys">(keyId),
        reason: reason.trim() || undefined,
      });
      toast.success(`API key "${keyName}" has been revoked`);
      setReason("");
      onClose();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to revoke API key";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/40 data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0" />
        <DialogPrimitive.Popup
          role="alertdialog"
          className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-full max-w-md rounded-none border border-border bg-card p-6 shadow-lg data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95"
        >
          <div className="flex items-start gap-4">
            <div className="flex size-10 shrink-0 items-center justify-center bg-destructive/10">
              <AlertTriangleIcon className="size-5 text-destructive" />
            </div>
            <div className="flex-1">
              <DialogPrimitive.Title className="text-sm font-semibold text-foreground">
                Revoke API Key
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-2 text-xs text-muted-foreground">
                Permanently revoke{" "}
                <span className="font-medium text-foreground">{keyName}</span>{" "}
                (
                <code className="font-mono text-[10px] bg-muted px-1 py-0.5">
                  {keyPrefix}...
                </code>
                )? This action cannot be undone. Any applications using this key
                will lose access immediately.
              </DialogPrimitive.Description>
            </div>
          </div>

          {/* Reason */}
          <div className="mt-4 space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Reason (optional)
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why is this key being revoked?"
              maxLength={500}
              rows={2}
              className={cn(
                "w-full border border-border bg-transparent px-2.5 py-1.5 text-xs",
                "placeholder:text-muted-foreground outline-hidden",
                "focus:border-ring focus:ring-1 focus:ring-ring/50",
              )}
            />
          </div>

          <div className="mt-6 flex items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleRevoke}
              disabled={isSubmitting}
            >
              {isSubmitting && (
                <LoaderIcon className="mr-1.5 size-3 animate-spin" />
              )}
              Revoke Key
            </Button>
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
