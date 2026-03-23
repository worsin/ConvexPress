import { createFileRoute } from "@tanstack/react-router";

import { useCurrentUser } from "@/hooks/useCurrentUser";
import { Skeleton } from "@/components/ui/skeleton";
import { ProfileForm } from "@/components/dashboard/profile/ProfileForm";

export const Route = createFileRoute("/dashboard/profile")({
  head: () => ({
    meta: [{ name: "robots", content: "noindex" }],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const { user, isLoading } = useCurrentUser();

  if (isLoading || !user) {
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
      <ProfileForm user={user} />
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
