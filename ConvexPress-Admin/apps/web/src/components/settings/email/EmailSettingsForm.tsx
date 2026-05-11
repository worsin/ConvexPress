/**
 * EmailSettingsForm - Resend API configuration + email delivery overview.
 *
 * Two sections:
 *   1. Resend API Configuration: API key, webhook secret, from address,
 *      from name -- saved to the "email" settings section.
 *   2. Delivery Configuration: read-only display of rate limits, queue
 *      processing, and system status from stored email settings.
 *
 * Uses the settings system (updateSection mutation with section: "email")
 * for persistence. API key and webhook secret are masked password fields.
 */

import { useState, useCallback, useEffect } from "react";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import { api } from "@backend/convex/_generated/api";
import { toast } from "sonner";
import {
  Mail,
  Shield,
  Gauge,
  Key,
  Loader2,
  Save,
  Eye,
  EyeOff,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function EmailSettingsForm() {
  const emailSettings = useQuery(api.settings.queries.getBySection, {
    section: "email",
  });
  const updateSettings = useMutation(api.settings.mutations.updateSection);
  const repairEmailSystem = useMutation(api.emails.mutations.repairSystem);

  // Form state for editable fields
  const [resendApiKey, setResendApiKey] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [fromAddress, setFromAddress] = useState("");
  const [fromName, setFromName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isRepairing, setIsRepairing] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [showWebhookSecret, setShowWebhookSecret] = useState(false);

  // Sync from server on first load
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (emailSettings && !initialized) {
      const values = emailSettings as Record<string, unknown>;
      setResendApiKey((values.resendApiKey as string) ?? "");
      setWebhookSecret((values.webhookSecret as string) ?? "");
      setFromAddress((values.fromAddress as string) ?? "noreply@convexpress.com");
      setFromName((values.fromName as string) ?? "ConvexPress");
      setInitialized(true);
    }
  }, [emailSettings, initialized]);

  // Save handler -- merges editable fields with existing values
  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      // Read current stored values so we only override what changed
      const currentValues = emailSettings
        ? (() => {
            const {
              _id,
              _creationTime,
              updatedAt,
              updatedBy,
              section: _s,
              ...rest
            } = emailSettings as Record<string, unknown>;
            return rest;
          })()
        : {};

      await updateSettings({
        section: "email",
        values: {
          ...currentValues,
          resendApiKey,
          webhookSecret,
          fromAddress,
          fromName,
        },
      });
      toast.success("Email settings saved.");
    } catch (error: unknown) {
      const msg =
        error instanceof Error ? error.message : "Failed to save email settings.";
      toast.error(msg);
    } finally {
      setIsSaving(false);
    }
  }, [emailSettings, updateSettings, resendApiKey, webhookSecret, fromAddress, fromName]);

  const handleRepair = useCallback(async () => {
    setIsRepairing(true);
    try {
      const result = await repairEmailSystem({});
      const templateSummary = `${result.templates.created} created, ${result.templates.updated} updated`;
      const listenerSummary = `${result.listeners.created} listeners added, ${result.listeners.reactivated} reactivated`;
      toast.success(`Email system repaired: ${templateSummary}; ${listenerSummary}.`);
    } catch (error: unknown) {
      const msg =
        error instanceof Error ? error.message : "Failed to repair email system.";
      toast.error(msg);
    } finally {
      setIsRepairing(false);
    }
  }, [repairEmailSystem]);

  // Loading state
  if (emailSettings === undefined) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="animate-pulse space-y-4">
            <div className="h-4 w-48 rounded bg-muted" />
            <div className="h-9 rounded bg-muted" />
            <div className="h-9 rounded bg-muted" />
          </div>
        </CardContent>
      </Card>
    );
  }

  // Read-only values from stored settings
  const storedValues = emailSettings as Record<string, unknown>;
  const rateLimit = (storedValues.rateLimit as number) ?? 50;
  const dailyLimit = (storedValues.dailyLimit as number) ?? 1000;
  const batchWindow = (storedValues.batchWindow as number) ?? 15;
  const enabled = (storedValues.enabled as boolean) ?? true;

  return (
    <div className="flex flex-col gap-6">
      {/* Resend API Configuration */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Key className="size-4 text-muted-foreground" />
            <div>
              <CardTitle>Resend API Configuration</CardTitle>
              <CardDescription className="mt-0.5">
                Connect your Resend account for transactional email delivery.
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <div className="flex flex-col gap-4">
            {/* Resend API Key */}
            <div className="space-y-1.5">
              <Label htmlFor="resend-api-key">Resend API Key</Label>
              <div className="relative">
                <Input
                  id="resend-api-key"
                  type={showApiKey ? "text" : "password"}
                  value={resendApiKey}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setResendApiKey(e.target.value)
                  }
                  placeholder="re_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey((prev) => !prev)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={showApiKey ? "Hide API key" : "Show API key"}
                >
                  {showApiKey ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                </button>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Get your API key from{" "}
                <a
                  href="https://resend.com/api-keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline"
                >
                  resend.com/api-keys
                </a>
                . Falls back to the RESEND_API_KEY environment variable if empty.
              </p>
            </div>

            {/* Webhook Secret */}
            <div className="space-y-1.5">
              <Label htmlFor="resend-webhook-secret">Webhook Secret</Label>
              <div className="relative">
                <Input
                  id="resend-webhook-secret"
                  type={showWebhookSecret ? "text" : "password"}
                  value={webhookSecret}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setWebhookSecret(e.target.value)
                  }
                  placeholder="whsec_xxxxxxxxxxxxxxxxxxxxxxxx"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowWebhookSecret((prev) => !prev)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={
                    showWebhookSecret ? "Hide webhook secret" : "Show webhook secret"
                  }
                >
                  {showWebhookSecret ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                </button>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Used to verify incoming Resend webhook events. Configure webhooks at{" "}
                <a
                  href="https://resend.com/webhooks"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline"
                >
                  resend.com/webhooks
                </a>
                .
              </p>
            </div>

            {/* From Address */}
            <div className="space-y-1.5">
              <Label htmlFor="email-from-address">From Address</Label>
              <Input
                id="email-from-address"
                type="email"
                value={fromAddress}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setFromAddress(e.target.value)
                }
                placeholder="noreply@yoursite.com"
              />
              <p className="text-[10px] text-muted-foreground">
                The sender email address for all outgoing emails. Must be a verified
                domain in Resend.
              </p>
            </div>

            {/* From Name */}
            <div className="space-y-1.5">
              <Label htmlFor="email-from-name">From Name</Label>
              <Input
                id="email-from-name"
                type="text"
                value={fromName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setFromName(e.target.value)
                }
                placeholder="ConvexPress"
              />
              <p className="text-[10px] text-muted-foreground">
                Display name shown to email recipients alongside the from address.
              </p>
            </div>

            {/* Save Button */}
            <div className="flex justify-end gap-2 pt-2">
              <Button
                size="sm"
                variant="outline"
                onClick={handleRepair}
                disabled={isRepairing}
              >
                {isRepairing ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Shield className="size-3.5" />
                )}
                <span>{isRepairing ? "Repairing..." : "Repair Email System"}</span>
              </Button>
              <Button size="sm" onClick={handleSave} disabled={isSaving}>
                {isSaving ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Save className="size-3.5" />
                )}
                <span>{isSaving ? "Saving..." : "Save Settings"}</span>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Delivery Configuration (read-only overview) */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Mail className="size-4 text-muted-foreground" />
            <div>
              <CardTitle>Delivery Configuration</CardTitle>
              <CardDescription className="mt-0.5">
                Current email delivery settings and rate limits.
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            {/* Sender Settings */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                <Mail className="size-3.5" />
                Sender
              </div>
              <ConfigField label="From Address" value={fromAddress || "noreply@convexpress.com"} />
              <ConfigField label="From Name" value={fromName || "ConvexPress"} />
              <ConfigField
                label="Reply-To"
                value={(storedValues.replyTo as string) ?? "support@convexpress.com"}
              />
            </div>

            {/* Rate Limits */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                <Gauge className="size-3.5" />
                Rate Limits
              </div>
              <ConfigField label="Per Minute" value={`${rateLimit} emails`} />
              <ConfigField
                label="Daily Limit"
                value={`${dailyLimit.toLocaleString()} emails`}
              />
              <ConfigField label="Batch Window" value={`${batchWindow} minutes`} />
            </div>

            {/* System Status */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                <Shield className="size-3.5" />
                System Status
              </div>

              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">Email System</span>
                <span
                  className={cn(
                    "inline-flex items-center border px-1.5 py-0.5 text-[10px] font-medium",
                    enabled
                      ? "bg-success/10 text-success border-success/20"
                      : "bg-destructive/10 text-destructive border-destructive/20",
                  )}
                >
                  {enabled ? "Enabled" : "Disabled"}
                </span>
              </div>

              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">Provider</span>
                <span className="text-foreground">Resend</span>
              </div>

              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">API Key</span>
                <span
                  className={cn(
                    "inline-flex items-center border px-1.5 py-0.5 text-[10px] font-medium",
                    resendApiKey
                      ? "bg-success/10 text-success border-success/20"
                      : "bg-foreground/5 text-muted-foreground border-foreground/10",
                  )}
                >
                  {resendApiKey ? "Configured" : "Not Set"}
                </span>
              </div>

              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">Queue Processing</span>
                <span className="text-foreground">Every 5 min (cron)</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ConfigField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground font-mono text-[10px]">{value}</span>
    </div>
  );
}
