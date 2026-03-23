/**
 * Create Key Dialog
 *
 * Modal form for creating a new API key.
 * Includes name input, scope selector, optional rate limits and expiration.
 * On success, opens KeyCreatedDialog to show the plaintext key.
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
import { ScopeSelector } from "./scope-selector";
import { KeyCreatedDialog } from "./key-created-dialog";
import type { ApiKeyScope, CreateKeyResult } from "@/lib/api/types";

/** Args for createKey mutation */
interface CreateKeyArgs {
  name: string;
  scopes: ApiKeyScope[];
  rateLimitPerMinute?: number;
  rateLimitPerHour?: number;
  expiresAt?: number;
}

interface CreateKeyDialogProps {
  open: boolean;
  onClose: () => void;
}

export function CreateKeyDialog({ open, onClose }: CreateKeyDialogProps) {
  const createKey = useMutation(api.api.mutations.createKey);

  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<ApiKeyScope[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [rateLimitPerMinute, setRateLimitPerMinute] = useState("60");
  const [rateLimitPerHour, setRateLimitPerHour] = useState("1000");
  const [expiresIn, setExpiresIn] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Key created result state
  const [createdResult, setCreatedResult] = useState<CreateKeyResult | null>(null);

  const resetForm = () => {
    setName("");
    setScopes([]);
    setShowAdvanced(false);
    setRateLimitPerMinute("60");
    setRateLimitPerHour("1000");
    setExpiresIn("");
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
      toast.error("API key name is required");
      return;
    }
    if (scopes.length === 0) {
      toast.error("At least one scope is required");
      return;
    }

    setIsSubmitting(true);
    try {
      const args: CreateKeyArgs = {
        name: name.trim(),
        scopes,
      };

      const rateMin = parseInt(rateLimitPerMinute, 10);
      const rateHour = parseInt(rateLimitPerHour, 10);
      if (!isNaN(rateMin) && rateMin !== 60) args.rateLimitPerMinute = rateMin;
      if (!isNaN(rateHour) && rateHour !== 1000) args.rateLimitPerHour = rateHour;

      if (expiresIn) {
        const days = parseInt(expiresIn, 10);
        if (!isNaN(days) && days > 0) {
          args.expiresAt = Date.now() + days * 24 * 60 * 60 * 1000;
        }
      }

      const result = await createKey(args);
      setCreatedResult(result as CreateKeyResult);
      toast.success(`API key "${name.trim()}" created`);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to create API key";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Show key created dialog after successful creation
  if (createdResult) {
    return (
      <KeyCreatedDialog
        open={true}
        onClose={() => {
          setCreatedResult(null);
          resetForm();
          onClose();
        }}
        apiKey={createdResult.key}
        keyName={createdResult.name}
      />
    );
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/40 data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0" />
        <DialogPrimitive.Popup className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-none border border-border bg-card p-6 shadow-lg data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95">
          <DialogPrimitive.Title className="text-sm font-semibold text-foreground mb-1">
            Create New API Key
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="text-xs text-muted-foreground mb-4">
            Create a scoped API key for external application access.
          </DialogPrimitive.Description>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Name */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">
                Key Name
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Mobile App, CI/CD Pipeline"
                maxLength={200}
                autoFocus
              />
            </div>

            {/* Scopes */}
            <ScopeSelector selected={scopes} onChange={setScopes} />

            {/* Advanced settings (collapsed) */}
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
                        Rate Limit / Minute
                      </label>
                      <Input
                        type="number"
                        value={rateLimitPerMinute}
                        onChange={(e) => setRateLimitPerMinute(e.target.value)}
                        min={1}
                        max={600}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-foreground">
                        Rate Limit / Hour
                      </label>
                      <Input
                        type="number"
                        value={rateLimitPerHour}
                        onChange={(e) => setRateLimitPerHour(e.target.value)}
                        min={1}
                        max={10000}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-foreground">
                      Expires In (days)
                    </label>
                    <Input
                      type="number"
                      value={expiresIn}
                      onChange={(e) => setExpiresIn(e.target.value)}
                      placeholder="Leave empty for no expiration"
                      min={1}
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Optional. Leave blank for a key that never expires.
                    </p>
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
                disabled={isSubmitting || scopes.length === 0 || !name.trim()}
              >
                {isSubmitting ? (
                  <LoaderIcon className="mr-1.5 size-3 animate-spin" />
                ) : (
                  <PlusIcon className="mr-1 size-3" />
                )}
                Create Key
              </Button>
            </div>
          </form>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
