/**
 * CommentAuthorInfo - Read-only author display on the Edit Comment page.
 *
 * Shows avatar (64px), name, submission date.
 */

interface CommentAuthorInfoProps {
  authorName: string;
  authorAvatarUrl?: string;
  authorId: string;
  createdAt: number;
}

export function CommentAuthorInfo({
  authorName,
  authorAvatarUrl,
  authorId,
  createdAt,
}: CommentAuthorInfoProps) {
  const date = new Date(createdAt);
  const formattedDate = date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const formattedTime = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div className="border border-border bg-card p-4">
      <h3 className="text-xs font-semibold text-foreground mb-3">Author</h3>
      <div className="flex items-start gap-3">
        {authorAvatarUrl ? (
          <img
            src={authorAvatarUrl}
            alt={authorName}
            className="size-16 rounded-none object-cover shrink-0"
          />
        ) : (
          <div className="flex size-16 items-center justify-center rounded-none bg-muted text-lg font-medium text-muted-foreground shrink-0">
            {authorName.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <div className="text-sm font-medium text-foreground">
            {authorName}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            Submitted on {formattedDate} at {formattedTime}
          </div>
        </div>
      </div>
    </div>
  );
}
