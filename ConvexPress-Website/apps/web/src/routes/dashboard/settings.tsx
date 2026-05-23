import { createFileRoute } from "@tanstack/react-router";

import { useCurrentUser } from "@/hooks/useCurrentUser";
import { Skeleton } from "@/components/ui/skeleton";
import { AccountSettingsForm } from "@/components/dashboard/settings/AccountSettingsForm";
import { buildRestrictedPageHead } from "@/lib/seo/head";

export const Route = createFileRoute("/dashboard/settings")({
  head: () => buildRestrictedPageHead({
    title: "Account Settings - ConvexPress",
    path: "/dashboard/settings",
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { user, isLoading } = useCurrentUser();

  if (isLoading || !user) {
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
      <AccountSettingsForm user={user} />
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
