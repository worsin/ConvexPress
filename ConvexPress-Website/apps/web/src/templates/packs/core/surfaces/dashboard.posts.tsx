/** Core · dashboard.posts — the member's posts with status and date. */
import { Link } from "@tanstack/react-router";
import { PenSquare } from "lucide-react";

import { EmptyState } from "@/components/dashboard/EmptyState";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import type { UserProfile } from "@/lib/dashboard/types";
import type { SurfaceProps } from "@/templates/sdk/types";

export interface DashboardPostRow {
  _id: string;
  slug: string;
  title?: string | null;
  status: string;
  createdAt: number;
}

export interface DashboardPostsSurfaceData {
  /** The signed-in member; null while loading or signed out. */
  user: UserProfile | null;
  isLoading: boolean;
  /** undefined while the posts query loads. */
  posts: DashboardPostRow[] | undefined;
}

export default function CoreDashboardPosts({ data }: SurfaceProps<DashboardPostsSurfaceData>) {
  const { user, isLoading, posts } = data;

  if (isLoading || !user) {
    return <PostsSkeleton />;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-sm font-medium text-foreground">My Posts</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          View and manage your published and draft content.
        </p>
      </div>

      {posts === undefined ? (
        <PostsSkeleton showHeader={false} />
      ) : posts.length === 0 ? (
        <EmptyState
          icon={PenSquare}
          title="No posts yet"
          description="You haven't written any posts. Start creating your first post."
        />
      ) : (
        <div className="border border-border bg-card">
          {/* Table header */}
          <div className="grid grid-cols-[1fr_100px_120px] gap-2 border-b border-border px-4 py-2 text-[10px] font-medium text-muted-foreground">
            <span>Title</span>
            <span>Status</span>
            <span>Date</span>
          </div>

          {/* Table rows */}
          {posts.map((post) => (
            <div
              key={post._id}
              className="grid grid-cols-[1fr_100px_120px] items-center gap-2 border-b border-border px-4 py-2.5 last:border-b-0"
            >
              <Link
                to={`/blog/${post.slug}`}
                className="truncate text-xs text-foreground hover:text-primary"
              >
                {post.title || "(no title)"}
              </Link>
              <StatusBadge status={post.status} />
              <span className="text-[10px] text-muted-foreground">
                {new Date(post.createdAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PostsSkeleton({ showHeader = true }: { showHeader?: boolean }) {
  return (
    <div className="space-y-4">
      {showHeader && (
        <div>
          <Skeleton className="h-5 w-24" />
          <Skeleton className="mt-1 h-3 w-64" />
        </div>
      )}
      <div className="border border-border bg-card">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="grid grid-cols-[1fr_100px_120px] gap-2 border-b border-border px-4 py-2.5 last:border-b-0"
          >
            <Skeleton className="h-3 w-3/4" />
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}
