/**
 * My Posts loader: the current member and their posts (posts.queries.list),
 * handed to the `dashboard.posts` surface.
 */
import { useQuery } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";

import { useCapabilityAccess } from "@/hooks/useCan";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import CoreDashboardPosts, {
  type DashboardPostRow,
  type DashboardPostsSurfaceData,
} from "@/templates/packs/core/surfaces/dashboard.posts";
import { Surface } from "@/templates/sdk/Surface";

export function MyPostsPage() {
  const access = useCapabilityAccess("edit_posts");
  if (access === "pending") {
    return <p role="status" className="py-12 text-sm text-muted-foreground">Loading your access…</p>;
  }
  if (access === "denied") {
    return (
      <section className="space-y-2 py-12" aria-labelledby="posts-access-title">
        <h1 id="posts-access-title" className="text-xl font-medium">Posting is not available for this account</h1>
        <p className="text-sm text-muted-foreground">You can continue using the other pages in your account.</p>
      </section>
    );
  }
  return <AuthorizedPostsPage />;
}

function AuthorizedPostsPage() {
  const { user, isLoading } = useCurrentUser();

  // Fetch the current user's posts from Convex
  const postsResult = useQuery(
    api.posts.queries.list,
    user?._id
      ? {
          type: "post" as const,
          authorId: user._id,
          perPage: 50,
        }
      : "skip",
  ) as { posts?: DashboardPostRow[] } | undefined;

  const data: DashboardPostsSurfaceData = {
    user: user ?? null,
    isLoading,
    posts: postsResult?.posts,
  };

  return <Surface name="dashboard.posts" data={data} fallback={CoreDashboardPosts} />;
}
