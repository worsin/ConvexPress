import { createFileRoute } from "@tanstack/react-router";

import { useCurrentUser } from "@/hooks/useCurrentUser";
import { Skeleton } from "@/components/ui/skeleton";
import { NotificationFeed } from "@/components/dashboard/notifications/NotificationFeed";
import { NotificationPreferencesSection } from "@/components/dashboard/notifications/NotificationPreferencesSection";

export const Route = createFileRoute("/dashboard/notifications")({
  head: () => ({
    meta: [{ name: "robots", content: "noindex" }],
  }),
  component: NotificationsPage,
});

function NotificationsPage() {
  const { user, isLoading } = useCurrentUser();

  if (isLoading || !user) {
    return <NotificationsSkeleton />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-sm font-medium text-foreground">Notifications</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Your notification history and preferences.
        </p>
      </div>
      <NotificationFeed />
      <NotificationPreferencesSection />
    </div>
  );
}

function NotificationsSkeleton() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-5 w-32" />
        <Skeleton className="mt-1 h-3 w-56" />
      </div>
      <Skeleton className="h-8 w-full" />
      <div className="space-y-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    </div>
  );
}
