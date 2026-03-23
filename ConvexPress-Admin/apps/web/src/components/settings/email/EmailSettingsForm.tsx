/**
 * EmailSettingsForm - Email configuration overview.
 *
 * Displays current email configuration defaults. These values are
 * currently managed through backend constants (EMAIL_DEFAULTS).
 * When the settings schema is extended with an "email" section,
 * this form will be converted to use useSettingsForm for live editing.
 *
 * Shows: from address, from name, reply-to, rate limits, and system status.
 */

import {
  Mail,
  Shield,
  Gauge,
  Info,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { SettingsCallout } from "@/components/settings/SettingsCallout";

// Current email defaults (mirrors backend EMAIL_DEFAULTS)
const EMAIL_CONFIG = {
  fromAddress: "noreply@smithharper.com",
  fromName: "SmithHarper CMS",
  replyTo: "support@smithharper.com",
  rateLimit: 50,
  dailyLimit: 1000,
  batchWindow: 15,
  enabled: true,
};

export function EmailSettingsForm() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Mail className="size-4 text-muted-foreground" />
          <div>
            <CardTitle>Email Configuration</CardTitle>
            <CardDescription className="mt-0.5">
              Current email delivery settings and rate limits.
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <SettingsCallout type="info">
          Email configuration is managed through backend defaults. To change
          these values, update the EMAIL_DEFAULTS constant in the backend email
          helper or extend the settings system with an "email" section.
        </SettingsCallout>

        <div className="mt-4 grid grid-cols-1 gap-6 sm:grid-cols-3">
          {/* Sender Settings */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
              <Mail className="size-3.5" />
              Sender
            </div>

            <ConfigField label="From Address" value={EMAIL_CONFIG.fromAddress} />
            <ConfigField label="From Name" value={EMAIL_CONFIG.fromName} />
            <ConfigField label="Reply-To" value={EMAIL_CONFIG.replyTo} />
          </div>

          {/* Rate Limits */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
              <Gauge className="size-3.5" />
              Rate Limits
            </div>

            <ConfigField
              label="Per Minute"
              value={`${EMAIL_CONFIG.rateLimit} emails`}
            />
            <ConfigField
              label="Daily Limit"
              value={`${EMAIL_CONFIG.dailyLimit.toLocaleString()} emails`}
            />
            <ConfigField
              label="Batch Window"
              value={`${EMAIL_CONFIG.batchWindow} minutes`}
            />
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
                  EMAIL_CONFIG.enabled
                    ? "bg-success/10 text-success border-success/20"
                    : "bg-destructive/10 text-destructive border-destructive/20",
                )}
              >
                {EMAIL_CONFIG.enabled ? "Enabled" : "Disabled"}
              </span>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">Provider</span>
              <span className="text-foreground">Resend</span>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">Queue Processing</span>
              <span className="text-foreground">Every 5 min (cron)</span>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">Weekly Digest</span>
              <span className="text-foreground">Mon 8:00 AM UTC</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
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
