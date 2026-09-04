/** Core · dashboard.profile — edit the public profile (avatar, names, bio, social links). */
import { ProfileForm } from "@/components/dashboard/profile/ProfileForm";
import { Skeleton } from "@/components/ui/skeleton";
import type { UserProfile } from "@/lib/dashboard/types";
import type { SurfaceProps } from "@/templates/sdk/types";

export interface DashboardProfileSurfaceData {
  /** The signed-in member; null while loading or signed out. */
  user: UserProfile | null;
  isLoading: boolean;
}

export default function CoreDashboardProfile({ data }: SurfaceProps<DashboardProfileSurfaceData>) {
  if (data.isLoading || !data.user) {
    return <ProfileSkeleton />;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-sm font-medium text-foreground">Edit Profile</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Update your public profile information.
        </p>
      </div>
      <ProfileForm user={data.user} />
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-5 w-32" />
        <Skeleton className="mt-1 h-3 w-64" />
      </div>
      <Skeleton className="h-40" />
      <Skeleton className="h-32" />
      <Skeleton className="h-48" />
    </div>
  );
}
