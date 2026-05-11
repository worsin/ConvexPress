/**
 * Webhook Created Dialog
 *
 * One-time display of the plaintext signing secret after webhook creation.
 * Shows the secret in a monospace display with a copy button and
 * verification code example.
 *
 * Uses Base UI Dialog (NOT Radix).
 */

import { useState } from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { CheckIcon, CopyIcon, WebhookIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

interface WebhookCreatedDialogProps {
  open: boolean;
  onClose: () => void;
  secret: string;
  webhookName: string;
}

export function WebhookCreatedDialog({
  open,
  onClose,
  secret,
  webhookName,
}: WebhookCreatedDialogProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/40 data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0" />
        <DialogPrimitive.Popup className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg rounded-none border border-border bg-card p-6 shadow-lg data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex size-10 items-center justify-center bg-success/10">
              <WebhookIcon className="size-5 text-success" />
            </div>
            <div>
              <DialogPrimitive.Title className="text-sm font-semibold text-foreground">
                Webhook Created
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="text-xs text-muted-foreground">
                {webhookName}
              </DialogPrimitive.Description>
            </div>
          </div>

          {/* Warning banner */}
          <div className="mb-4 border border-warning/30 bg-warning/5 p-3">
            <p className="text-xs font-medium text-warning">
              This signing secret will only be shown once. Copy it now and store
              it securely in your application.
            </p>
          </div>

          {/* Secret display */}
          <div className="relative mb-4">
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              Signing Secret
            </label>
            <div className="bg-muted p-3 font-mono text-xs break-all select-all border border-border">
              {secret}
            </div>
            <button
              type="button"
              onClick={handleCopy}
              className="absolute top-7 right-2 p-1.5 bg-card border border-border hover:bg-muted transition-colors"
              aria-label="Copy signing secret"
            >
              {copied ? (
                <CheckIcon className="size-3.5 text-success" />
              ) : (
                <CopyIcon className="size-3.5 text-muted-foreground" />
              )}
            </button>
          </div>

          {/* Verification example */}
          <div className="mb-6">
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              Signature Verification (Node.js)
            </label>
            <pre className="bg-muted p-3 text-[10px] font-mono overflow-x-auto border border-border text-muted-foreground">
{`const crypto = require('crypto');

function verifySignature(body, secret, signature) {
  const expected = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  );
}`}
            </pre>
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
