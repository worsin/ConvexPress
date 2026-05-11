import { useState, useCallback } from "react";
import { useMutation } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import type { UserPreferences, UserProfile } from "@/lib/dashboard/types";
import { extractErrorMessage } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DashboardCard } from "../DashboardCard";
import { DeleteAccountDialog } from "./DeleteAccountDialog";
import { EmailPreferences } from "./EmailPreferences";
import { NotificationPreferences } from "./NotificationPreferences";
import { PasswordChangeSection } from "./PasswordChangeSection";

interface AccountSettingsFormProps {
  user: UserProfile;
}

/**
 * Main form for the Account Settings page.
 * Includes email display, password change, notification preferences, and danger zone.
 */
export function AccountSettingsForm({ user }: AccountSettingsFormProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const updateProfile = useMutation(api.profiles.mutations.updateProfile);

  const handleSavePreferences = useCallback(
    async (prefs: Partial<UserPreferences>) => {
      try {
        await updateProfile({ preferences: prefs });
      } catch (error: unknown) {
        toast.error(extractErrorMessage(error, "Failed to save preferences"));
      }
    },
    [updateProfile],
  );

  return (
    <div className="space-y-6">
      {/* Email Section */}
      <DashboardCard
        title="Email Address"
        description="Managed by your authentication provider."
      >
        <div className="space-y-1.5">
          <Label htmlFor="settings-email">Email</Label>
          <Input
            id="settings-email"
            type="email"
            value={user.email}
            disabled
            aria-describedby="settings-email-note"
          />
          <p
            id="settings-email-note"
            className="text-[10px] text-muted-foreground"
          >
            To change your email, contact support or update via your
            authentication provider.
          </p>
        </div>
      </DashboardCard>

      {/* Password Section */}
      <PasswordChangeSection user={user} />

      {/* Notification Preferences */}
      <NotificationPreferences
        preferences={user.preferences}
        onSave={handleSavePreferences}
      />

      {/* Email Preferences */}
      <EmailPreferences />

      {/* Danger Zone */}
      <DashboardCard title="Danger Zone">
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Permanently delete your account and all associated data. This action
            cannot be undone.
          </p>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setDeleteDialogOpen(true)}
          >
            <Trash2 className="size-3.5" />
            <span>Delete Account</span>
          </Button>
        </div>
      </DashboardCard>

      {/* Delete Account Dialog */}
      <DeleteAccountDialog
        user={user}
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
      />
    </div>
  );
}
