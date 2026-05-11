/**
 * Per-notification-type preference toggles displayed at the bottom
 * of the notifications page. Collapsible section.
 *
 * Wired to Convex getPreferences query and updatePreferences mutation.
 * Renders all 30 notification types grouped by 9 categories.
 */

import { useCallback, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";
import { ChevronDown, ChevronRight, Save } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { useBrowserNotificationPermission } from "@/hooks/useBrowserNotificationPermission";
import type { NotificationPreference } from "@/lib/dashboard/types";

const CATEGORY_ORDER = [
  "Content",
  "Comments",
  "Media",
  "Users",
  "Security",
  "Account",
  "Support",
  "Knowledge Base",
  "Commerce",
  "System",
  "Discovery",
  "Developer",
];

/**
 * Auth context is resolved internally by the query -- no userId prop needed.
 */
export function NotificationPreferencesSection() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [localChanges, setLocalChanges] = useState<
    Map<string, { siteEnabled: boolean; toastEnabled: boolean }>
  >(new Map());

  // Real Convex queries
  const preferences = useQuery(
    api.notifications.queries.getPreferences,
    {},
  ) as NotificationPreference[] | undefined;

  const updatePreferences = useMutation(
    api.notifications.mutations.updatePreferences,
  );
  const {
    supported,
    canRequest,
    isGranted,
    isDenied,
    requestPermission,
  } = useBrowserNotificationPermission();

  const isLoading = preferences === undefined;

  // Group preferences by category
  const grouped = new Map<string, NotificationPreference[]>();
  if (preferences) {
    for (const pref of preferences) {
      const existing = grouped.get(pref.category) ?? [];
      existing.push(pref);
      grouped.set(pref.category, existing);
    }
  }

  const getEffectiveValue = (
    pref: NotificationPreference,
    field: "siteEnabled" | "toastEnabled",
  ): boolean => {
    const local = localChanges.get(pref.notificationKey);
    if (local) return local[field];
    return pref[field];
  };

  const handleToggle = (
    key: string,
    field: "siteEnabled" | "toastEnabled",
    currentValue: boolean,
  ) => {
    setLocalChanges((prev) => {
      const next = new Map(prev);
      const pref = preferences?.find((p) => p.notificationKey === key);
      const existing = next.get(key) ?? {
        siteEnabled: pref?.siteEnabled ?? true,
        toastEnabled: pref?.toastEnabled ?? true,
      };
      next.set(key, { ...existing, [field]: !currentValue });
      return next;
    });
  };

  const hasPendingChanges = localChanges.size > 0;

  const handleSave = useCallback(async () => {
    if (localChanges.size === 0) return;
    setSaving(true);
    try {
      const prefsToUpdate = Array.from(localChanges.entries()).map(
        ([key, vals]) => ({
          notificationKey: key,
          siteEnabled: vals.siteEnabled,
          toastEnabled: vals.toastEnabled,
        }),
      );
      await updatePreferences({ preferences: prefsToUpdate });
      setLocalChanges(new Map());
      toast.success("Notification preferences saved");
    } catch {
      toast.error("Failed to save preferences");
    } finally {
      setSaving(false);
    }
  }, [localChanges, updatePreferences]);

  const handleEnableDesktop = useCallback(async () => {
    const result = await requestPermission();
    if (result === "granted") {
      toast.success("Desktop notifications enabled");
    } else if (result === "denied") {
      toast.error("Desktop notifications were blocked by the browser");
    }
  }, [requestPermission]);

  const desktopStatus = !supported
    ? "This browser does not support desktop notifications."
    : isGranted
      ? "Desktop notifications are enabled for background alerts."
      : isDenied
        ? "Desktop notifications are blocked in browser settings."
        : "Enable browser permission to receive desktop alerts while this tab is in the background.";

  return (
    <div
      data-slot="notification-preferences-section"
      className="border border-border bg-card"
    >
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-muted/50"
      >
        <span className="text-sm font-medium text-foreground">
          Notification Preferences
        </span>
        {isExpanded ? (
          <ChevronDown className="size-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-4 text-muted-foreground" />
        )}
      </button>

      {isExpanded && (
        <div className="border-t border-border px-4 py-3">
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="h-6 w-full animate-pulse rounded bg-muted"
                />
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="border border-border bg-muted/20 px-3 py-2">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-medium text-foreground">
                      Desktop Delivery
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      The Popup/Desktop toggle below controls foreground toasts
                      and background desktop alerts for each notification type.
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {desktopStatus}
                    </p>
                  </div>

                  {supported && canRequest && (
                    <button
                      type="button"
                      onClick={handleEnableDesktop}
                      className="border border-border bg-background px-2.5 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-muted"
                    >
                      Enable Desktop Alerts
                    </button>
                  )}
                </div>
              </div>

              {/* Save button */}
              {hasPendingChanges && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving}
                    className="inline-flex items-center gap-1.5 border border-border bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                  >
                    <Save className="size-3" />
                    {saving ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              )}

              {/* Categories */}
              {CATEGORY_ORDER.map((category) => {
                const items = grouped.get(category);
                if (!items || items.length === 0) return null;

                return (
                  <div key={category}>
                    <h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {category}
                    </h4>

                    {/* Column headers */}
                    <div className="mb-1 grid grid-cols-[1fr_80px_80px] gap-2 text-[10px] font-medium text-muted-foreground">
                      <span>Type</span>
                      <span className="text-center">In-App</span>
                      <span className="text-center">Popup / Desktop</span>
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
                            label={`${pref.notificationName} in-app notifications`}
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
                            label={`${pref.notificationName} popup or desktop notifications`}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
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
