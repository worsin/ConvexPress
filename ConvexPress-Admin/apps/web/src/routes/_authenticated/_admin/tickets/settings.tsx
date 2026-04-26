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
import { Plus, Save, Trash2 } from "lucide-react";

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

type TicketCategory = {
  value: string;
  label: string;
};

function TicketSettingsForm() {
  const settings = useQuery(api.tickets.settings.getTicketSettings);
  const updateSettings = useMutation(api.tickets.settings.updateTicketSettings);

  const [autoCloseDays, setAutoCloseDays] = useState(14);
  const [slaFirstResponse, setSlaFirstResponse] = useState(240);
  const [slaResolution, setSlaResolution] = useState(2880);
  const [defaultPriority, setDefaultPriority] = useState("medium");
  const [categories, setCategories] = useState<TicketCategory[]>([]);
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
    if (Array.isArray(settings.general.categories)) {
      setCategories(settings.general.categories);
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
          categories: categories
            .map((category) => ({
              value:
                category.value.trim() || normalizeCategoryValue(category.label),
              label: category.label.trim(),
            }))
            .filter((category) => category.value && category.label),
          defaultPriority: defaultPriority as "low" | "medium" | "high" | "urgent",
          autoCloseAfterDays: autoCloseDays,
        },
        sla: {
          firstResponseTarget: slaFirstResponse,
          resolutionTarget: slaResolution,
        },
      });
      toast.success("Settings saved");
    } catch (error: unknown) {
      toast.error((error as { data?: { message?: string } })?.data?.message ?? "Failed to save settings");
    } finally {
      setIsSaving(false);
    }
  }

  if (settings === undefined) {
    return (
      <div className="max-w-2xl space-y-6 animate-pulse">
        <div className="h-8 w-44 bg-muted rounded" />
        <div className="h-32 bg-muted rounded-lg" />
        <div className="h-32 bg-muted rounded-lg" />
      </div>
    );
  }

  if (settings === null) {
    return (
      <div className="max-w-2xl space-y-2">
        <h1 className="text-2xl font-bold">Ticket Settings</h1>
        <p className="text-sm text-muted-foreground">
          Ticket settings are available when the Support Tickets extension is
          enabled and your account can view tickets.
        </p>
      </div>
    );
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
            <option value="urgent">Urgent</option>
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

      {/* Categories */}
      <div className="rounded-lg border border-border p-6 space-y-4">
        <h2 className="text-lg font-semibold">Categories</h2>
        <p className="text-sm text-muted-foreground">
          Categories are saved in ticket.general and used when classifying new
          tickets.
        </p>
        <div className="space-y-3">
          {categories.map((category, index) => (
            <div key={`${category.value}-${index}`} className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
              <input
                type="text"
                value={category.label}
                onChange={(event) => {
                  const label = event.target.value;
                  setCategories((current) =>
                    current.map((entry, entryIndex) =>
                      entryIndex === index
                        ? {
                            ...entry,
                            label,
                            value: normalizeCategoryValue(label),
                          }
                        : entry,
                    ),
                  );
                }}
                placeholder="Label"
                className="px-3 py-1.5 text-sm border border-border rounded-md bg-card"
              />
              <input
                type="text"
                value={category.value}
                onChange={(event) => {
                  const value = event.target.value;
                  setCategories((current) =>
                    current.map((entry, entryIndex) =>
                      entryIndex === index ? { ...entry, value } : entry,
                    ),
                  );
                }}
                placeholder="value"
                className="px-3 py-1.5 text-sm border border-border rounded-md bg-card"
              />
              <button
                type="button"
                onClick={() =>
                  setCategories((current) =>
                    current.filter((_, entryIndex) => entryIndex !== index),
                  )
                }
                className="inline-flex items-center justify-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
              >
                <Trash2 className="h-4 w-4" />
                Remove
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() =>
            setCategories((current) => [
              ...current,
              { value: "newCategory", label: "New Category" },
            ])
          }
          className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
        >
          <Plus className="h-4 w-4" />
          Add Category
        </button>
      </div>

      {/* Save */}
      <button
        onClick={() => void handleSave()}
        disabled={isSaving}
        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50 transition-colors"
      >
        <Save className="h-4 w-4" />
        {isSaving ? "Saving..." : "Save Settings"}
      </button>
    </div>
  );
}

function normalizeCategoryValue(value: string) {
  const normalized = value
    .trim()
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();

  return normalized || "category";
}
