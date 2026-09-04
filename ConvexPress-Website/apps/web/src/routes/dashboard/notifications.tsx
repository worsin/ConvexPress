import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { useCurrentUser } from "@/hooks/useCurrentUser";
import { Skeleton } from "@/components/ui/skeleton";
import notificationsPageModule from "@/dashboard/pages/notifications/manifest";

/** Deep-link state for the center: view tab, open notification, kind chip, preferences tab. */
const searchSchema = z.object({
  view: z.enum(["inbox", "unread", "needs", "snoozed", "archived"]).optional(),
  id: z.string().optional(),
  kind: z.enum(["support", "commerce", "learning", "content", "account", "system"]).optional(),
  tab: z.enum(["preferences"]).optional(),
});

export const Route = createFileRoute("/dashboard/notifications")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [{ name: "robots", content: "noindex" }],
  }),
  component: NotificationsRoute,
});

function NotificationsRoute() {
  const { user, isLoading } = useCurrentUser();
  const { Page } = notificationsPageModule;

  if (isLoading || !user) {
    return <NotificationsSkeleton />;
  }

  return <Page subpath="" />;
}

function NotificationsSkeleton() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-7 w-40" />
        <Skeleton className="mt-1 h-4 w-56" />
      </div>
      <Skeleton className="h-9 w-full max-w-lg rounded-4xl" />
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[76px] w-full rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
