/**
 * Notification Settings Page
 *
 * Admin-only page at /admin/settings/notifications
 * Features:
 *   - System-wide notification delivery monitoring
 *   - Per-notification-type preferences (admin's own)
 *   - Test notification button
 *   - Recent notification activity log
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import {
  Bell,
  CheckCheck,
  Send,
  Settings,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  useNotificationPreferences,
  useNotificationMutations,
} from "@/hooks/use-notifications";
import { NOTIFICATION_CATEGORIES } from "@/lib/notifications/constants";
import type { NotificationPreference } from "@/lib/notifications/types";

interface NotificationActivityRow {
  _id: string;
  type: "info" | "success" | "warning" | "error";
  title: string;
  actorName?: string;
  readAt?: number;
  dismissedAt?: number;
  createdAt: number;
}

interface NotificationListResult {
  notifications: NotificationActivityRow[];
}

export const Route = createFileRoute(
  "/_authenticated/_admin/settings/notifications",
)({
  component: NotificationSettingsPage,
});

function NotificationSettingsPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      {/* Page header */}
      <div>
        <h1 className="flex items-center gap-2 text-lg font-semibold text-foreground">
          <Bell className="size-5" />
          Notification Settings
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your notification preferences and monitor notification
          delivery.
        </p>
      </div>

      {/* Preferences section */}
      <PreferencesSection />

      {/* Test notification */}
      <TestNotificationSection />

      {/* Recent activity monitor */}
      <RecentActivitySection />
    </div>
  );
}

// ─── Preferences Section ──────────────────────────────────────────────────────

function PreferencesSection() {
  const { preferences, isLoading } = useNotificationPreferences();
  const { updatePreferences } = useNotificationMutations();
  const [localPrefs, setLocalPrefs] = useState<
    Map<string, { siteEnabled: boolean; toastEnabled: boolean }>
  >(new Map());
  const [saveStatus, setSaveStatus] = useState<"idle" | "pending" | "saving" | "saved" | "error">(
    "idle",
  );
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Group preferences by category
  const grouped = new Map<string, NotificationPreference[]>();
  for (const pref of preferences) {
    const existing = grouped.get(pref.category) ?? [];
    existing.push(pref);
    grouped.set(pref.category, existing);
  }

  const handleToggle = (
    key: string,
    field: "siteEnabled" | "toastEnabled",
    currentValue: boolean,
  ) => {
    setLocalPrefs((prev) => {
      const next = new Map(prev);
      const existing = next.get(key) ?? {
        siteEnabled:
          preferences.find((p) => p.notificationKey === key)?.siteEnabled ??
          true,
        toastEnabled:
          preferences.find((p) => p.notificationKey === key)?.toastEnabled ??
          true,
      };
      next.set(key, { ...existing, [field]: !currentValue });
      return next;
    });
  };

  const getEffectiveValue = (
    pref: NotificationPreference,
    field: "siteEnabled" | "toastEnabled",
  ): boolean => {
    const local = localPrefs.get(pref.notificationKey);
    if (local) return local[field];
    return pref[field];
  };

  const pendingUpdates = useMemo(
    () =>
      Array.from(localPrefs.entries()).map(([key, vals]) => ({
        notificationKey: key,
        siteEnabled: vals.siteEnabled,
        toastEnabled: vals.toastEnabled,
      })),
    [localPrefs],
  );
  const pendingSignature = useMemo(() => JSON.stringify(pendingUpdates), [pendingUpdates]);

  useEffect(() => {
    if (pendingUpdates.length === 0) {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      return;
    }

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    setSaveStatus("pending");

    const snapshot = [...pendingUpdates];
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      setSaveStatus("saving");
      void updatePreferences({ preferences: snapshot })
        .then(() => {
          setLocalPrefs((prev) => {
            const next = new Map(prev);
            for (const update of snapshot) {
              next.delete(update.notificationKey);
            }
            return next;
          });
          setSaveStatus("saved");
        })
        .catch(() => {
          setSaveStatus("error");
          toast.error("Failed to save preferences");
        });
    }, 600);
  }, [pendingSignature, pendingUpdates, updatePreferences]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, []);

  const statusText =
    saveStatus === "saving"
      ? "Saving..."
      : saveStatus === "pending"
        ? "Saving shortly..."
        : saveStatus === "saved"
          ? "All changes saved."
          : saveStatus === "error"
            ? "Autosave failed. Try toggling again."
            : "All changes saved.";

  if (isLoading) {
    return (
      <section className="border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <div className="h-5 w-48 animate-pulse rounded bg-muted" />
        </div>
        <div className="space-y-2 p-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-8 w-full animate-pulse rounded bg-muted" />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Settings className="size-4" />
            My Notification Preferences
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Choose which notifications you receive and how.
          </p>
        </div>
        <div
          className={cn(
            "inline-flex items-center gap-1.5 text-xs",
            saveStatus === "error" && "text-destructive",
            saveStatus !== "error" && "text-muted-foreground",
          )}
          aria-live="polite"
        >
          {(saveStatus === "saving" || saveStatus === "pending") && (
            <Loader2 className="size-3 animate-spin" />
          )}
          <span>{statusText}</span>
        </div>
      </div>

      <div className="divide-y divide-border">
        {NOTIFICATION_CATEGORIES.map((category) => {
          const items = grouped.get(category);
          if (!items || items.length === 0) return null;

          return (
            <div key={category} className="px-4 py-3">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {category}
              </h3>

              {/* Column headers */}
              <div className="mb-1 grid grid-cols-[1fr_80px_80px] gap-2 text-[10px] font-medium text-muted-foreground">
                <span>Notification</span>
                <span className="text-center">In-App</span>
                <span className="text-center">Toast</span>
              </div>

              {/* Preference rows */}
              {items.map((pref) => (
                <div
                  key={pref.notificationKey}
                  className="grid grid-cols-[1fr_80px_80px] items-center gap-2 py-1.5"
                >
                  <span className="text-xs text-foreground">
                    {pref.notificationName}
                  </span>
                  <div className="flex justify-center">
                    <ToggleSwitch
                      checked={getEffectiveValue(pref, "siteEnabled")}
                      onChange={() =>
                        handleToggle(
                          pref.notificationKey,
                          "siteEnabled",
                          getEffectiveValue(pref, "siteEnabled"),
                        )
                      }
                      label={`${pref.notificationName} in-app`}
                    />
                  </div>
                  <div className="flex justify-center">
                    <ToggleSwitch
                      checked={getEffectiveValue(pref, "toastEnabled")}
                      onChange={() =>
                        handleToggle(
                          pref.notificationKey,
                          "toastEnabled",
                          getEffectiveValue(pref, "toastEnabled"),
                        )
                      }
                      label={`${pref.notificationName} toast`}
                    />
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ─── Toggle Switch ────────────────────────────────────────────────────────────

function ToggleSwitch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={cn(
        "relative inline-flex h-4 w-7 shrink-0 cursor-pointer items-center rounded-full border border-border transition-colors",
        checked ? "bg-primary" : "bg-muted",
      )}
    >
      <span
        className={cn(
          "pointer-events-none block size-2.5 rounded-full bg-background shadow-sm transition-transform",
          checked ? "translate-x-[13px]" : "translate-x-[2px]",
        )}
      />
    </button>
  );
}

// ─── Test Notification Section ────────────────────────────────────────────────

function TestNotificationSection() {
  const [sending, setSending] = useState(false);
  const sendTestNotification = useMutation(
    api.notifications.mutations.sendTestNotification,
  );

  const handleSendTest = async () => {
    setSending(true);
    try {
      await sendTestNotification({});
      toast.success("Test notification sent", {
        description:
          "A real test notification has been created. Check your bell icon.",
        duration: 4000,
      });
    } catch {
      toast.error("Failed to send test notification");
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="border border-border bg-card px-4 py-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Send className="size-4" />
            Test Notification
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Send a real test notification to verify delivery is working.
          </p>
        </div>
        <button
          type="button"
          onClick={handleSendTest}
          disabled={sending}
          className="inline-flex items-center gap-1.5 border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
        >
          <Send className="size-3" />
          {sending ? "Sending..." : "Send Test"}
        </button>
      </div>
    </section>
  );
}

// ─── Recent Activity Section ──────────────────────────────────────────────────

function RecentActivitySection() {
  const result = useQuery(api.notifications.queries.listAll, { limit: 20 }) as
    | NotificationListResult
    | undefined;

  return (
    <section className="border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-medium text-foreground">
          <CheckCheck className="size-4" />
          Recent Notification Activity
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          System-wide notification delivery log (admin view).
        </p>
      </div>

      <div className="max-h-96 overflow-y-auto">
        {result === undefined ? (
          <div className="space-y-0">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="flex gap-2 border-b border-border px-4 py-2.5 last:border-b-0"
              >
                <div className="h-3 w-16 animate-pulse rounded bg-muted" />
                <div className="h-3 flex-1 animate-pulse rounded bg-muted" />
                <div className="h-3 w-12 animate-pulse rounded bg-muted" />
              </div>
            ))}
          </div>
        ) : result.notifications.length > 0 ? (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="px-4 py-2 font-medium">Type</th>
                <th className="px-4 py-2 font-medium">Title</th>
                <th className="px-4 py-2 font-medium">Actor</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {result.notifications.map((n) => (
                <tr key={n._id} className="hover:bg-muted/30">
                  <td className="px-4 py-2">
                    <span
                      className={cn(
                        "inline-block rounded px-1.5 py-0.5 text-[10px] font-medium",
                        n.type === "info" && "bg-primary/10 text-primary",
                        n.type === "success" && "bg-primary/10 text-primary",
                        n.type === "warning" &&
                          "bg-foreground/5 text-foreground/60",
                        n.type === "error" &&
                          "bg-destructive/10 text-destructive",
                      )}
                    >
                      {n.type}
                    </span>
                  </td>
                  <td className="max-w-xs truncate px-4 py-2 text-foreground">
                    {n.title}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {n.actorName ?? "-"}
                  </td>
                  <td className="px-4 py-2">
                    {n.readAt ? (
                      <span className="text-muted-foreground">Read</span>
                    ) : n.dismissedAt ? (
                      <span className="text-muted-foreground">Dismissed</span>
                    ) : (
                      <span className="font-medium text-primary">Unread</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-muted-foreground">
                    {formatTime(n.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="px-4 py-8 text-center text-xs text-muted-foreground">
            No notification activity yet.
          </div>
        )}
      </div>
    </section>
  );
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 0) return `${diffDays}d ago`;
  if (diffHours > 0) return `${diffHours}h ago`;
  if (diffMins > 0) return `${diffMins}m ago`;
  return "Just now";
}
