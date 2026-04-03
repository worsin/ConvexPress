/**
 * Ticket Settings Route - /admin/tickets/settings
 *
 * Settings for the ticket system: default priority, auto-close config,
 * SLA first-response and resolution targets.
 */

import { useState, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import { RoutePermissionGuard } from "@/lib/route-permission-guard";
import { toast } from "sonner";
import { Save } from "lucide-react";

export const Route = createFileRoute(
  "/_authenticated/_admin/tickets/settings",
)({
  component: TicketSettingsPage,
});

// ─── Page ─────────────────────────────────────────────────────────────────────

function TicketSettingsPage() {
  return (
    <RoutePermissionGuard requiredAccess="/admin/tickets">
      <TicketSettingsForm />
    </RoutePermissionGuard>
  );
}

// ─── Form Component ───────────────────────────────────────────────────────────

function TicketSettingsForm() {
  const settings = useQuery(api.tickets.settings.getTicketSettings);
  const updateSettings = useMutation(api.tickets.settings.updateTicketSettings);

  const [autoCloseDays, setAutoCloseDays] = useState(14);
  const [slaFirstResponse, setSlaFirstResponse] = useState(240);
  const [slaResolution, setSlaResolution] = useState(2880);
  const [defaultPriority, setDefaultPriority] = useState("medium");
  const [isSaving, setIsSaving] = useState(false);

  // Sync form state when settings load
  useEffect(() => {
    if (!settings) return;
    if (settings.general.defaultPriority !== undefined) {
      setDefaultPriority(settings.general.defaultPriority);
    }
    if (settings.general.autoCloseAfterDays !== undefined) {
      setAutoCloseDays(settings.general.autoCloseAfterDays);
    }
    if (settings.sla.firstResponseTarget !== undefined) {
      setSlaFirstResponse(settings.sla.firstResponseTarget);
    }
    if (settings.sla.resolutionTarget !== undefined) {
      setSlaResolution(settings.sla.resolutionTarget);
    }
  }, [settings]);

  async function handleSave() {
    setIsSaving(true);
    try {
      await updateSettings({
        general: {
          defaultPriority: defaultPriority as "low" | "medium" | "high" | "urgent",
          autoCloseAfterDays: autoCloseDays,
        },
        sla: {
          firstResponseTarget: slaFirstResponse,
          resolutionTarget: slaResolution,
        },
      });
      toast.success("Settings saved");
    } catch (error: any) {
      toast.error(error?.data?.message ?? "Failed to save settings");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Ticket Settings</h1>

      {/* General */}
      <div className="rounded-lg border border-border p-6 space-y-4">
        <h2 className="text-lg font-semibold">General</h2>

        <div>
          <label className="block text-sm font-medium text-foreground/70 mb-1">
            Default Priority
          </label>
          <select
            value={defaultPriority}
            onChange={(e) => setDefaultPriority(e.target.value)}
            className="w-full max-w-xs px-3 py-1.5 text-sm border border-border rounded-md bg-card"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
          <p className="text-xs text-foreground/40 mt-1">
            Applied when a ticket is created without an explicit priority.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground/70 mb-1">
            Auto-close resolved tickets after (days)
          </label>
          <input
            type="number"
            min={0}
            value={autoCloseDays}
            onChange={(e) => setAutoCloseDays(Number(e.target.value))}
            className="w-full max-w-xs px-3 py-1.5 text-sm border border-border rounded-md bg-card"
          />
          <p className="text-xs text-foreground/40 mt-1">
            Set to 0 to disable auto-close.
          </p>
        </div>
      </div>

      {/* SLA Targets */}
      <div className="rounded-lg border border-border p-6 space-y-4">
        <h2 className="text-lg font-semibold">SLA Targets</h2>

        <div>
          <label className="block text-sm font-medium text-foreground/70 mb-1">
            First Response Target (minutes)
          </label>
          <input
            type="number"
            min={1}
            value={slaFirstResponse}
            onChange={(e) => setSlaFirstResponse(Number(e.target.value))}
            className="w-full max-w-xs px-3 py-1.5 text-sm border border-border rounded-md bg-card"
          />
          <p className="text-xs text-foreground/40 mt-1">
            Default: 240 minutes (4 hours)
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground/70 mb-1">
            Resolution Target (minutes)
          </label>
          <input
            type="number"
            min={1}
            value={slaResolution}
            onChange={(e) => setSlaResolution(Number(e.target.value))}
            className="w-full max-w-xs px-3 py-1.5 text-sm border border-border rounded-md bg-card"
          />
          <p className="text-xs text-foreground/40 mt-1">
            Default: 2880 minutes (48 hours)
          </p>
        </div>
      </div>

      {/* Categories (informational for now) */}
      <div className="rounded-lg border border-border p-6 space-y-2">
        <h2 className="text-lg font-semibold">Categories</h2>
        <p className="text-sm text-muted-foreground">
          Ticket categories are currently fixed: Billing, Technical, Account,
          Feature Request, General, Other.
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          {[
            "Billing",
            "Technical",
            "Account",
            "Feature Request",
            "General",
            "Other",
          ].map((cat) => (
            <span
              key={cat}
              className="text-xs bg-muted px-2 py-1 rounded border border-border"
            >
              {cat}
            </span>
          ))}
        </div>
      </div>

      {/* Save */}
      <button
        onClick={() => void handleSave()}
        disabled={isSaving || settings === undefined}
        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50 transition-colors"
      >
        <Save className="h-4 w-4" />
        {isSaving ? "Saving..." : "Save Settings"}
      </button>
    </div>
  );
}
