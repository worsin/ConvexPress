/**
 * CommentFlagsList - Displays flags on a comment in the Edit Comment page.
 *
 * Shows each flag's reason and any details.
 * Flags are resolved when the comment is moderated (approved/rejected/spam/trashed).
 */

interface CommentFlagsListProps {
  flagCount: number;
  flaggedReasons?: string[];
}

const FLAG_REASON_LABELS: Record<string, string> = {
  spam: "Spam",
  harassment: "Harassment",
  "off-topic": "Off-topic",
  misinformation: "Misinformation",
  other: "Other",
};

export function CommentFlagsList({
  flagCount,
  flaggedReasons,
}: CommentFlagsListProps) {
  if (flagCount === 0) return null;

  return (
    <div className="border border-border bg-card p-4">
      <h3 className="text-xs font-semibold text-foreground mb-3">
        Flags ({flagCount})
      </h3>
      {flaggedReasons && flaggedReasons.length > 0 ? (
        <ul className="space-y-1">
          {flaggedReasons.map((reason) => (
            <li key={reason} className="text-xs text-muted-foreground flex items-center gap-2">
              <span className="size-1.5 rounded-none bg-destructive/50 shrink-0" />
              {FLAG_REASON_LABELS[reason] ?? reason}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">
          {flagCount} flag(s) received. Review comment content carefully.
        </p>
      )}
    </div>
  );
}
