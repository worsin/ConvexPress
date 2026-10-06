/**
 * Depot · dashboard.posts — the member's posts as a dense `DataTable`
 * (title, status badge, date). Same gate, loading and empty states as Core.
 */
import { DashboardPostTitle } from "@/components/dashboard/DashboardPostTitle";

import type { DashboardPostsSurfaceData } from "@/templates/packs/core/surfaces/dashboard.posts";
import type { SurfaceProps } from "@/templates/sdk/types";

import { DataTable, EmptyState, LinkButton, Td, Th, formatDate } from "../parts";
import { DashboardPageHeader, DashboardSkeleton, StatusBadge, TableSkeleton } from "../parts/extra-dashboard";

export default function DepotDashboardPosts({ data }: SurfaceProps<DashboardPostsSurfaceData>) {
  const { user, isLoading, posts } = data;

  if (isLoading || !user) {
    return <DashboardSkeleton blocks={["h-48"]} />;
  }

  return (
    <div data-slot="dashboard-posts" data-pack="depot" className="flex flex-col gap-4">
      <DashboardPageHeader eyebrow="Content" title="My posts" description="View and manage your published and draft content." meta={posts ? `${posts.length} ${posts.length === 1 ? "post" : "posts"}` : undefined} />

      {posts === undefined ? (
        <TableSkeleton rows={5} />
      ) : posts.length === 0 ? (
        <EmptyState title="No posts yet" description="You haven't written any posts. Start creating your first post." action={<LinkButton to="/blog" variant="secondary">Visit the blog</LinkButton>} />
      ) : (
        <DataTable caption="Your posts">
          <thead>
            <tr>
              <Th>Title</Th>
              <Th>Status</Th>
              <Th className="text-right">Date</Th>
            </tr>
          </thead>
          <tbody>
            {posts.map((post) => (
              <tr key={post._id} className="border-t border-border">
                <Td className="min-w-56">
                  <DashboardPostTitle post={post} className="line-clamp-1 font-medium text-foreground" />
                </Td>
                <Td>
                  <StatusBadge status={post.status} />
                </Td>
                <Td align="right" className="whitespace-nowrap text-muted-foreground">
                  {formatDate(post.createdAt) ?? "—"}
                </Td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}
    </div>
  );
}
