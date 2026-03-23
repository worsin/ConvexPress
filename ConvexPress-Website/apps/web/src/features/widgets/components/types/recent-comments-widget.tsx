/**
 * Recent Comments Widget - Website Renderer
 *
 * Displays a list of recent approved comments.
 */

import { useQuery } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";

interface RecentCommentsWidgetConfig {
  number?: number;
}

export function RecentCommentsWidget({
  config,
}: {
  config: RecentCommentsWidgetConfig;
}) {
  const count = config.number ?? 5;

  // useQuery must be called unconditionally (Rules of Hooks).
  // Optional chaining on api.comments?.queries?.recent is kept for safety
  // because the ConvexPress-Website's Convex codegen types may not include comment
  // system paths. The `as any` is needed until codegen is refreshed.
  const comments = useQuery(api.comments?.queries?.recent as any, {
    limit: count,
  });

  if (!comments || comments.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No recent comments.</p>
    );
  }

  return (
    <ul className="space-y-2">
      {comments.slice(0, count).map((comment: (typeof comments)[number]) => (
        <li key={comment._id} className="text-sm">
          <span className="font-medium">{comment.authorName || "Anonymous"}</span>
          {" on "}
          <a
            href={comment.postUrl || "#"}
            className="hover:underline text-foreground/70"
          >
            {comment.postTitle || "a post"}
          </a>
          {comment.content && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
              {comment.content}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
