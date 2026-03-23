/**
 * Create/Edit Webhook Form
 *
 * Full form for creating or editing a webhook.
 * Includes name, HTTPS URL, event code dropdown, content type,
 * and collapsed advanced settings.
 *
 * Uses Base UI Dialog (NOT Radix).
 */

import { useState } from "react";
import { useMutation } from "convex/react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { LoaderIcon, PlusIcon } from "lucide-react";
import { toast } from "sonner";

import { api } from "@backend/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EventCodeSelect } from "./event-code-select";
import { WebhookCreatedDialog } from "./webhook-created-dialog";
import type { CreateWebhookResult } from "@/lib/api/types";

type CreateWebhookArgs = {
  name: string;
  deliveryUrl: string;
  eventCode: string;
  contentType: string;
  maxConsecutiveFailures?: number;
  deliveryTimeout?: number;
};

interface CreateWebhookFormProps {
  open: boolean;
  onClose: () => void;
}

export function CreateWebhookForm({ open, onClose }: CreateWebhookFormProps) {
  const createWebhook = useMutation(api.api.mutations.createWebhook);

  const [name, setName] = useState("");
  const [deliveryUrl, setDeliveryUrl] = useState("");
  const [eventCode, setEventCode] = useState("");
  const [contentType, setContentType] = useState<
    "application/json" | "application/x-www-form-urlencoded"
  >("application/json");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [maxConsecutiveFailures, setMaxConsecutiveFailures] = useState("5");
  const [deliveryTimeout, setDeliveryTimeout] = useState("15000");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Created result
  const [createdResult, setCreatedResult] =
    useState<CreateWebhookResult | null>(null);

  const resetForm = () => {
    setName("");
    setDeliveryUrl("");
    setEventCode("");
    setContentType("application/json");
    setShowAdvanced(false);
    setMaxConsecutiveFailures("5");
    setDeliveryTimeout("15000");
    setIsSubmitting(false);
  };

  const handleClose = () => {
    if (!createdResult) {
      resetForm();
    }
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      toast.error("Webhook name is required");
      return;
    }
    if (!deliveryUrl.trim()) {
      toast.error("Delivery URL is required");
      return;
    }
    if (!deliveryUrl.startsWith("https://")) {
      toast.error("Delivery URL must use HTTPS");
      return;
    }
    if (!eventCode) {
      toast.error("Event code is required");
      return;
    }

    setIsSubmitting(true);
    try {
      const maxFail = parseInt(maxConsecutiveFailures, 10);
      const timeout = parseInt(deliveryTimeout, 10);

      const args: CreateWebhookArgs = {
        name: name.trim(),
        deliveryUrl: deliveryUrl.trim(),
        eventCode,
        contentType,
        ...((!isNaN(maxFail) && maxFail !== 5) && { maxConsecutiveFailures: maxFail }),
        ...((!isNaN(timeout) && timeout !== 15000) && { deliveryTimeout: timeout }),
      };

      const result = await createWebhook(args);
      setCreatedResult(result as CreateWebhookResult);
      toast.success(`Webhook "${name.trim()}" created`);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to create webhook";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Show secret after creation
  if (createdResult) {
    return (
      <WebhookCreatedDialog
        open={true}
        onClose={() => {
          setCreatedResult(null);
          resetForm();
          onClose();
        }}
        secret={createdResult.secret}
        webhookName={createdResult.name}
      />
    );
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/40 data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0" />
        <DialogPrimitive.Popup className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-none border border-border bg-card p-6 shadow-lg data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95">
          <DialogPrimitive.Title className="text-sm font-semibold text-foreground mb-1">
            Create New Webhook
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="text-xs text-muted-foreground mb-4">
            Configure an outbound webhook to notify external services when events
            occur.
          </DialogPrimitive.Description>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Name */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">
                Webhook Name
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Slack New Post Alert"
                maxLength={200}
                autoFocus
              />
            </div>

            {/* Delivery URL */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">
                Delivery URL
              </label>
              <Input
                value={deliveryUrl}
                onChange={(e) => setDeliveryUrl(e.target.value)}
                placeholder="https://example.com/webhook"
                type="url"
              />
              <p className="text-[10px] text-muted-foreground">
                Must be HTTPS. No localhost or private IP addresses.
              </p>
            </div>

            {/* Event Code */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">
                Event
              </label>
              <EventCodeSelect value={eventCode} onChange={setEventCode} />
            </div>

            {/* Content Type */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">
                Content Type
              </label>
              <div className="flex gap-4">
                <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                  <input
                    type="radio"
                    name="contentType"
                    value="application/json"
                    checked={contentType === "application/json"}
                    onChange={() => setContentType("application/json")}
                    className="size-3 accent-primary"
                  />
                  application/json
                </label>
                <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                  <input
                    type="radio"
                    name="contentType"
                    value="application/x-www-form-urlencoded"
                    checked={
                      contentType === "application/x-www-form-urlencoded"
                    }
                    onChange={() =>
                      setContentType("application/x-www-form-urlencoded")
                    }
                    className="size-3 accent-primary"
                  />
                  form-urlencoded
                </label>
              </div>
            </div>

            {/* Advanced settings */}
            <div>
              <button
                type="button"
                className="text-xs text-primary hover:underline"
                onClick={() => setShowAdvanced(!showAdvanced)}
              >
                {showAdvanced ? "Hide" : "Show"} Advanced Settings
              </button>

              {showAdvanced && (
                <div className="mt-3 space-y-3 border border-border p-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-foreground">
                        Max Failures Before Disable
                      </label>
                      <Input
                        type="number"
                        value={maxConsecutiveFailures}
                        onChange={(e) =>
                          setMaxConsecutiveFailures(e.target.value)
                        }
                        min={1}
                        max={20}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-foreground">
                        Timeout (ms)
                      </label>
                      <Input
                        type="number"
                        value={deliveryTimeout}
                        onChange={(e) => setDeliveryTimeout(e.target.value)}
                        min={1000}
                        max={30000}
                        step={1000}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleClose}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={
                  isSubmitting ||
                  !name.trim() ||
                  !deliveryUrl.trim() ||
                  !eventCode
                }
              >
                {isSubmitting ? (
                  <LoaderIcon className="mr-1.5 size-3 animate-spin" />
                ) : (
                  <PlusIcon className="mr-1 size-3" />
                )}
                Create Webhook
              </Button>
            </div>
          </form>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
