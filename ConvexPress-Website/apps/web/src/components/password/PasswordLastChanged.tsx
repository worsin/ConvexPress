import { Clock } from "lucide-react";

import { formatRelativeDate } from "@/lib/format";

interface PasswordLastChangedProps {
  /** Unix timestamp (ms) of last password change, or null if never changed. */
  lastPasswordChangedAt: number | null;
}

/**
 * Displays "Last changed: {date}" or "Never changed" for password status.
 *
 * Used in the dashboard settings password section and optionally in
 * the admin user edit page.
 *
 * Uses absolute date formatting for clarity.
 */
export function PasswordLastChanged({
  lastPasswordChangedAt,
}: PasswordLastChangedProps) {
  const formattedDate = lastPasswordChangedAt
    ? formatRelativeDate(lastPasswordChangedAt)
    : null;

  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <Clock className="size-3 shrink-0" />
      {formattedDate ? (
        <span>
          Last changed:{" "}
          <span className="font-medium text-foreground">{formattedDate}</span>
        </span>
      ) : (
        <span>Password has never been changed</span>
      )}
    </div>
  );
}
