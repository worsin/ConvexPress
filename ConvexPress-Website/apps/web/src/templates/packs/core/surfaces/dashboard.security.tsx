/** Core · dashboard.security — login activity and account security overview. */
import { SecurityOverview } from "@/components/dashboard/security/SecurityOverview";
import { Skeleton } from "@/components/ui/skeleton";
import type { UserProfile } from "@/lib/dashboard/types";
import type { SurfaceProps } from "@/templates/sdk/types";

export interface DashboardSecuritySurfaceData {
  /** The signed-in member; null while loading or signed out. */
  user: UserProfile | null;
  isLoading: boolean;
}

export default function CoreDashboardSecurity({ data }: SurfaceProps<DashboardSecuritySurfaceData>) {
  if (data.isLoading || !data.user) {
    return <SecuritySkeleton />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-sm font-medium text-foreground">Security</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Review your login activity and account security.
        </p>
      </div>
      <SecurityOverview />
    </div>
  );
}

function SecuritySkeleton() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-5 w-24" />
        <Skeleton className="mt-1 h-3 w-64" />
      </div>
      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4">
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
      </div>
      {/* Login history table */}
      <Skeleton className="h-8 w-full" />
      <div className="space-y-1">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    </div>
  );
}
