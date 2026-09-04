/** Core · dashboard.settings — account preferences (email, notifications, password, deletion). */
import { AccountSettingsForm } from "@/components/dashboard/settings/AccountSettingsForm";
import { Skeleton } from "@/components/ui/skeleton";
import type { UserProfile } from "@/lib/dashboard/types";
import type { SurfaceProps } from "@/templates/sdk/types";

export interface DashboardSettingsSurfaceData {
  /** The signed-in member; null while loading or signed out. */
  user: UserProfile | null;
  isLoading: boolean;
}

export default function CoreDashboardSettings({ data }: SurfaceProps<DashboardSettingsSurfaceData>) {
  if (data.isLoading || !data.user) {
    return <SettingsSkeleton />;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-sm font-medium text-foreground">
          Account Settings
        </h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Manage your account preferences.
        </p>
      </div>
      <AccountSettingsForm user={data.user} />
    </div>
  );
}

function SettingsSkeleton() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-5 w-40" />
        <Skeleton className="mt-1 h-3 w-56" />
      </div>
      <Skeleton className="h-24" />
      <Skeleton className="h-20" />
      <Skeleton className="h-48" />
      <Skeleton className="h-20" />
    </div>
  );
}
