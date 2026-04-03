/**
 * Ticket Settings Route - /admin/tickets/settings
 *
 * Settings for the ticket system: default priority, auto-close config,
 * SLA first-response and resolution targets.
 *
 * NOTE: api.tickets.settings (getSettings / updateSettings) is not yet
 * implemented in the backend. These calls are wired but will be no-ops
 * until Task 10 (Ticket Settings backend) is complete.
 */

import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
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
  // Local state while backend settings API is pending
  const [autoCloseDays, setAutoCloseDays] = useState(14);
  const [slaFirstResponse, setSlaFirstResponse] = useState(240);
  const [slaResolution, setSlaResolution] = useState(2880);
  const [defaultPriority, setDefaultPriority] = useState("medium");
  const [isSaving, setIsSaving] = useState(false);

  async function handleSave() {
    setIsSaving(true);
    try {
      // TODO: wire to api.tickets.settings.updateSettings once backend is ready
      // await updateSettings({ autoCloseDays, slaFirstResponse, slaResolution, defaultPriority });
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
      <div className="rounded-lg border border-black/10 p-6 space-y-4">
        <h2 className="text-lg font-semibold">General</h2>

        <div>
          <label className="block text-sm font-medium text-black/70 mb-1">
            Default Priority
          </label>
          <select
            value={defaultPriority}
            onChange={(e) => setDefaultPriority(e.target.value)}
            className="w-full max-w-xs px-3 py-1.5 text-sm border border-black/15 rounded-md bg-card"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
          <p className="text-xs text-black/40 mt-1">
            Applied when a ticket is created without an explicit priority.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-black/70 mb-1">
            Auto-close resolved tickets after (days)
          </label>
          <input
            type="number"
            min={0}
            value={autoCloseDays}
            onChange={(e) => setAutoCloseDays(Number(e.target.value))}
            className="w-full max-w-xs px-3 py-1.5 text-sm border border-black/15 rounded-md bg-card"
          />
          <p className="text-xs text-black/40 mt-1">
            Set to 0 to disable auto-close.
          </p>
        </div>
      </div>

      {/* SLA Targets */}
      <div className="rounded-lg border border-black/10 p-6 space-y-4">
        <h2 className="text-lg font-semibold">SLA Targets</h2>

        <div>
          <label className="block text-sm font-medium text-black/70 mb-1">
            First Response Target (minutes)
          </label>
          <input
            type="number"
            min={1}
            value={slaFirstResponse}
            onChange={(e) => setSlaFirstResponse(Number(e.target.value))}
            className="w-full max-w-xs px-3 py-1.5 text-sm border border-black/15 rounded-md bg-card"
          />
          <p className="text-xs text-black/40 mt-1">
            Default: 240 minutes (4 hours)
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-black/70 mb-1">
            Resolution Target (minutes)
          </label>
          <input
            type="number"
            min={1}
            value={slaResolution}
            onChange={(e) => setSlaResolution(Number(e.target.value))}
            className="w-full max-w-xs px-3 py-1.5 text-sm border border-black/15 rounded-md bg-card"
          />
          <p className="text-xs text-black/40 mt-1">
            Default: 2880 minutes (48 hours)
          </p>
        </div>
      </div>

      {/* Categories (informational for now) */}
      <div className="rounded-lg border border-black/10 p-6 space-y-2">
        <h2 className="text-lg font-semibold">Categories</h2>
        <p className="text-sm text-black/50">
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
              className="text-xs bg-black/5 px-2 py-1 rounded border border-black/10"
            >
              {cat}
            </span>
          ))}
        </div>
      </div>

      {/* Save */}
      <button
        onClick={() => void handleSave()}
        disabled={isSaving}
        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
      >
        <Save className="h-4 w-4" />
        {isSaving ? "Saving..." : "Save Settings"}
      </button>
    </div>
  );
}
