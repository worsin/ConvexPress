import { createFileRoute } from "@tanstack/react-router";

import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useUserDashboard } from "@/hooks/useUserDashboard";
import { Skeleton } from "@/components/ui/skeleton";
import { UserDashboard } from "@/components/dashboard/UserDashboard";
import { buildRestrictedPageHead } from "@/lib/seo/head";

export const Route = createFileRoute("/dashboard/")({
  head: () => buildRestrictedPageHead({
    title: "Dashboard - ConvexPress",
    path: "/dashboard",
  }),
  component: DashboardHomePage,
});

function DashboardHomePage() {
  const { user, isLoading: isUserLoading } = useCurrentUser();
  const { data: dashboardData } = useUserDashboard();

  if (isUserLoading || !user) {
    return <DashboardSkeleton />;
  }

  return <UserDashboard user={user} dashboardData={dashboardData ?? undefined} />;
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-5 w-48" />
        <Skeleton className="mt-1 h-3 w-64" />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>
    </div>
  );
}
