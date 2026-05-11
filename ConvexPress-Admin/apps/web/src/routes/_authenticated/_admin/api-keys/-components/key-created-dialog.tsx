/**
 * Key Created Dialog
 *
 * One-time display of the plaintext API key after creation.
 * Shows the key in a monospace display with a copy button.
 * Warns the user that the key will never be shown again.
 *
 * Uses Base UI Dialog (NOT Radix).
 */

import { useState } from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { CheckIcon, CopyIcon, KeyIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

interface KeyCreatedDialogProps {
  open: boolean;
  onClose: () => void;
  apiKey: string;
  keyName: string;
}

export function KeyCreatedDialog({
  open,
  onClose,
  apiKey,
  keyName,
}: KeyCreatedDialogProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(apiKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select text
    }
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/40 data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0" />
        <DialogPrimitive.Popup className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg rounded-none border border-border bg-card p-6 shadow-lg data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex size-10 items-center justify-center bg-success/10">
              <KeyIcon className="size-5 text-success" />
            </div>
            <div>
              <DialogPrimitive.Title className="text-sm font-semibold text-foreground">
                API Key Created
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="text-xs text-muted-foreground">
                {keyName}
              </DialogPrimitive.Description>
            </div>
          </div>

          {/* Warning banner */}
          <div className="mb-4 border border-warning/30 bg-warning/5 p-3">
            <p className="text-xs font-medium text-warning">
              This key will only be shown once. Copy it now and store it securely.
            </p>
          </div>

          {/* Key display */}
          <div className="relative mb-6">
            <div className="bg-muted p-3 font-mono text-xs break-all select-all border border-border">
              {apiKey}
            </div>
            <button
              type="button"
              onClick={handleCopy}
              className="absolute top-2 right-2 p-1.5 bg-card border border-border hover:bg-muted transition-colors"
              aria-label="Copy API key"
            >
              {copied ? (
                <CheckIcon className="size-3.5 text-success" />
              ) : (
                <CopyIcon className="size-3.5 text-muted-foreground" />
              )}
            </button>
          </div>

          <div className="flex justify-end">
            <Button variant="default" size="sm" onClick={onClose}>
              Done
            </Button>
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
