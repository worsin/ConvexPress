/**
 * Journal · dashboard.posts — the member's posts as rule-separated rows:
 * title, small-caps status pill, date. Same states as Core.
 */
import { Link } from "@tanstack/react-router";

import type { DashboardPostsSurfaceData } from "@/templates/packs/core/surfaces/dashboard.posts";
import type { SurfaceProps } from "@/templates/sdk/types";

import { EmptyState, SmallCaps } from "../parts";
import { PageHeading, PageSkeleton, Row, RowList, RowSkeleton, StatusPill, dashDate } from "../parts/extra-dashboard";

export default function JournalDashboardPosts({ data }: SurfaceProps<DashboardPostsSurfaceData>) {
  const { user, isLoading, posts } = data;

  if (isLoading || !user) return <PageSkeleton rows={5} />;

  return (
    <div data-slot="dashboard-posts" className="flex flex-col gap-10">
      <PageHeading eyebrow="Writing" title="My posts" lede="View and manage your published and draft content." />

      {posts === undefined ? (
        <RowSkeleton rows={5} />
      ) : posts.length === 0 ? (
        <EmptyState eyebrow="No posts yet" title="You haven't written any posts. Start creating your first post." />
      ) : (
        <RowList aria-label="Your posts">
          {posts.map((post) => (
            <Row key={post._id} className="flex-row items-baseline justify-between gap-6">
              <div className="flex min-w-0 flex-col gap-1.5">
                <Link to="/blog/$slug" params={{ slug: post.slug }} className="truncate font-display text-xl leading-snug tracking-tight text-foreground transition-colors hover:text-primary">
                  {post.title || "(no title)"}
                </Link>
                <SmallCaps as="time" className="tabular-nums" {...({ dateTime: new Date(post.createdAt).toISOString() } as object)}>
                  {dashDate(post.createdAt)}
                </SmallCaps>
              </div>
              <StatusPill status={post.status} />
            </Row>
          ))}
        </RowList>
      )}
    </div>
  );
}
