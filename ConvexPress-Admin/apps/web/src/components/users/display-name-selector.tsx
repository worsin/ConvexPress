/**
 * Display Name Selector
 *
 * WordPress-style "Display name publicly as" dropdown.
 * Generates options from user's name components (first name, last name,
 * nickname, username, email) and allows the user to pick one.
 *
 * Uses the Convex query `profiles.queries.getDisplayNameOptions` to
 * generate the dropdown options server-side.
 */

import { useQuery } from "convex-helpers/react/cache";
import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { cn } from "@/lib/utils";

interface DisplayNameSelectorProps {
  /** Current display name value. */
  value: string;
  /** Called when a display name is selected. */
  onChange: (displayName: string) => void;
  /** User ID for whom to generate options (omit for current user). */
  userId?: Id<"users">;
  /** Whether the selector is disabled. */
  disabled?: boolean;
  /** Additional CSS classes. */
  className?: string;
}

export function DisplayNameSelector({
  value,
  onChange,
  userId,
  disabled = false,
  className,
}: DisplayNameSelectorProps) {
  const options = useQuery(api.profiles.queries.getDisplayNameOptions, {
    userId,
  });

  const isLoading = options === undefined;

  // Ensure the current value is always in the options list
  const allOptions = options
    ? Array.from(new Set([...(value ? [value] : []), ...options]))
    : value
      ? [value]
      : [];

  return (
    <div>
      <label
        htmlFor="display-name-select"
        className="mb-1 block text-xs font-medium text-foreground"
      >
        Display name publicly as
      </label>
      <select
        id="display-name-select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled || isLoading}
        className={cn(
          "h-8 w-full border border-border bg-background px-2.5 text-xs text-foreground",
          "focus:border-ring focus:outline-hidden focus:ring-1 focus:ring-ring/50",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
      >
        {isLoading ? (
          <option>Loading...</option>
        ) : (
          allOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))
        )}
      </select>
    </div>
  );
}
