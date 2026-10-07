import { Link } from "@tanstack/react-router";

interface DashboardPostTitleProps {
  post: { title?: string | null; status: string; slug: string };
  className?: string;
}

/** Customer dashboards expose public links only after a post is published. */
export function DashboardPostTitle({ post, className }: DashboardPostTitleProps) {
  const title = post.title || "(no title)";
  if (post.status !== "published" || !post.slug.trim()) {
    return <span className={className}>{title}</span>;
  }
  return (
    <Link to="/blog/$slug" params={{ slug: post.slug }} className={`${className ?? ""} hover:text-primary`}>
      {title}
    </Link>
  );
}
