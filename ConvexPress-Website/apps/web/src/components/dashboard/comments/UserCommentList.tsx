import { MessageSquare } from "lucide-react";

import { cn } from "@/lib/utils";
import { useUserComments } from "@/hooks/useUserComments";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "../EmptyState";
import { UserCommentItem } from "./UserCommentItem";

interface UserCommentListProps {
  userId: string;
}

type FilterTab = "all" | "approved" | "pending";

const FILTER_TABS: { value: FilterTab; label: string }[] = [
  { value: "all", label: "All" },
  { value: "approved", label: "Approved" },
  { value: "pending", label: "Pending" },
];

/**
 * Full list of the user's own comments with filtering and actions.
 * All data fetching, filtering, and pagination logic is managed by
 * the useUserComments hook. This component is a pure rendering layer.
 */
export function UserCommentList({ userId }: UserCommentListProps) {
  const {
    comments,
    isLoading,
    activeFilter,
    setFilter,
    page,
    setPage,
    totalPages,
    total,
    hasPrevPage,
    hasNextPage,
  } = useUserComments({ userId });

  return (
    <div data-slot="user-comment-list" className="space-y-4">
      {/* Filter tabs */}
      <div className="flex items-center gap-1 border-b border-border">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setFilter(tab.value)}
            className={cn(
              "px-3 py-2 text-xs transition-colors",
              activeFilter === tab.value
                ? "border-b-2 border-primary font-medium text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Comment list */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-2 border-b border-border py-3">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-3 w-1/4" />
            </div>
          ))}
        </div>
      ) : comments && comments.length > 0 ? (
        <div>
          {comments.map((comment) => (
            <UserCommentItem key={comment._id} comment={comment} />
          ))}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4 border-t border-border">
              <span className="text-[10px] text-muted-foreground">
                Page {page} of {totalPages} ({total} comments)
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPage(page - 1)}
                  disabled={!hasPrevPage}
                  className="px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => setPage(page + 1)}
                  disabled={!hasNextPage}
                  className="px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <EmptyState
          icon={MessageSquare}
          title="You haven't made any comments yet"
          description="Join the conversation on a post."
          action={{ label: "Browse posts", href: "/blog" }}
        />
      )}
    </div>
  );
}
