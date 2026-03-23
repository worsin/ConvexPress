import { useCallback, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import type { UserPreferences } from "@/lib/dashboard/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { DashboardCard } from "../DashboardCard";

interface NotificationPreferencesProps {
  preferences: UserPreferences | null;
  onSave: (prefs: Partial<UserPreferences>) => void;
}

const DIGEST_OPTIONS = [
  { value: "immediate", label: "Immediate" },
  { value: "daily", label: "Daily digest" },
  { value: "weekly", label: "Weekly digest" },
  { value: "none", label: "None" },
] as const;

interface ToggleItem {
  key: "notifyOnComment" | "notifyOnReply" | "notifyOnMention";
  label: string;
  description: string;
}

const TOGGLE_ITEMS: ToggleItem[] = [
  {
    key: "notifyOnComment",
    label: "Comment on your post",
    description: "Get notified when someone comments on your post",
  },
  {
    key: "notifyOnReply",
    label: "Reply to your comment",
    description: "Get notified when someone replies to your comment",
  },
  {
    key: "notifyOnMention",
    label: "Mentions",
    description: "Get notified when someone mentions you",
  },
];

/**
 * Notification preference toggles for email digest and specific events.
 */
export function NotificationPreferences({
  preferences,
  onSave,
}: NotificationPreferencesProps) {
  const [emailDigest, setEmailDigest] = useState<UserPreferences["emailDigest"]>(
    preferences?.emailDigest ?? "immediate",
  );
  const [notifyOnComment, setNotifyOnComment] = useState(
    preferences?.notifyOnComment ?? true,
  );
  const [notifyOnReply, setNotifyOnReply] = useState(
    preferences?.notifyOnReply ?? true,
  );
  const [notifyOnMention, setNotifyOnMention] = useState(
    preferences?.notifyOnMention ?? true,
  );
  const [isSaving, setIsSaving] = useState(false);

  const toggleState: Record<string, boolean> = {
    notifyOnComment,
    notifyOnReply,
    notifyOnMention,
  };
  const toggleSetters: Record<string, (v: boolean) => void> = {
    notifyOnComment: setNotifyOnComment,
    notifyOnReply: setNotifyOnReply,
    notifyOnMention: setNotifyOnMention,
  };

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      onSave({
        emailDigest,
        notifyOnComment,
        notifyOnReply,
        notifyOnMention,
      });
      toast.success("Notification preferences saved");
    } catch {
      toast.error("Failed to save notification preferences");
    } finally {
      setIsSaving(false);
    }
  }, [emailDigest, notifyOnComment, notifyOnReply, notifyOnMention, onSave]);

  return (
    <DashboardCard title="Notification Preferences">
      <div className="space-y-4">
        {/* Email digest frequency */}
        <div className="space-y-1.5">
          <Label htmlFor="email-digest-select">Email Digest</Label>
          <select
            id="email-digest-select"
            value={emailDigest}
            onChange={(e) =>
              setEmailDigest(
                e.target.value as UserPreferences["emailDigest"],
              )
            }
            className={cn(
              "dark:bg-input/30 border-input focus-visible:border-ring focus-visible:ring-ring/50",
              "h-8 w-full rounded-none border bg-transparent px-2.5 py-1 text-xs",
              "outline-hidden transition-colors focus-visible:ring-1",
            )}
            aria-label="Email digest frequency"
          >
            {DIGEST_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {/* Toggle switches */}
        <div className="space-y-3">
          {TOGGLE_ITEMS.map((item) => (
            <div
              key={item.key}
              className="flex items-center justify-between gap-3"
            >
              <div>
                <p className="text-xs font-medium text-foreground">
                  {item.label}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {item.description}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={toggleState[item.key]}
                aria-label={item.label}
                onClick={() =>
                  toggleSetters[item.key]?.(!toggleState[item.key])
                }
                className={cn(
                  "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-border transition-colors",
                  toggleState[item.key]
                    ? "bg-primary"
                    : "bg-muted",
                )}
              >
                <span
                  className={cn(
                    "pointer-events-none block size-3.5 rounded-full bg-background shadow-sm transition-transform",
                    toggleState[item.key]
                      ? "translate-x-[18px]"
                      : "translate-x-[2px]",
                  )}
                />
              </button>
            </div>
          ))}
        </div>

        {/* Save button */}
        <div className="flex justify-end pt-2">
          <Button size="sm" onClick={handleSave} disabled={isSaving}>
            {isSaving && <Loader2 className="size-3.5 animate-spin" />}
            <span>{isSaving ? "Saving..." : "Save Preferences"}</span>
          </Button>
        </div>
      </div>
    </DashboardCard>
  );
}
