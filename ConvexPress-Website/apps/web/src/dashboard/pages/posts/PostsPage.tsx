/**
 * My Posts loader: the current member and their posts (posts.queries.list),
 * handed to the `dashboard.posts` surface.
 */
import { useQuery } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";

import { useCurrentUser } from "@/hooks/useCurrentUser";
import CoreDashboardPosts, {
  type DashboardPostRow,
  type DashboardPostsSurfaceData,
} from "@/templates/packs/core/surfaces/dashboard.posts";
import { Surface } from "@/templates/sdk/Surface";

export function MyPostsPage() {
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
