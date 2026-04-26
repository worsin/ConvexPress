/**
 * PageSelect - Searchable page selector.
 *
 * Used for: homepage, posts page, privacy policy page selection.
 * Wraps ComboboxField with page data from the real Convex pages.list query.
 */

import { useMemo } from "react";
import { useQuery } from "convex/react";

import { api } from "@backend/convex/_generated/api";
import type { FieldOption } from "@/types/settings";
import { ComboboxField } from "./fields/ComboboxField";
import type { SettingsFieldApi } from "./fields/types";

interface PageSelectProps {
  /** TanStack Form field API */
  field: SettingsFieldApi;
  /** Placeholder text */
  placeholder?: string;
  /** Whether to allow clearing the selection */
  clearable?: boolean;
  /** Disabled state */
  disabled?: boolean;
}

export function PageSelect({
  field,
  placeholder = "-- Select --",
  clearable = true,
  disabled,
}: PageSelectProps) {
  // Fetch published pages from Convex
  const pagesData = useQuery(api.pages.queries.list, {
    status: "publish",
    perPage: 100,
    orderBy: "title",
    orderDir: "asc",
  });

  const pages: FieldOption[] = useMemo(() => {
    if (!pagesData?.pages) return [];
    return pagesData.pages.map((p: { _id: string; title: string }) => ({
      label: p.title,
      value: p._id,
    }));
  }, [pagesData]);

  // Detect stale reference: value is set but not found in loaded pages (Fix #156)
  const currentValue = field.state.value as string | null;
  const isStale =
    currentValue &&
    pagesData !== undefined &&
    pages.length >= 0 &&
    !pages.some((p) => p.value === currentValue);

  return (
    <div className="flex flex-col gap-1">
      <ComboboxField
        field={field}
        options={pages}
        placeholder={placeholder}
        searchPlaceholder="Search pages..."
        clearable={clearable}
        disabled={disabled}
      />
      {isStale && (
        <p className="text-xs text-warning">
          The selected page may have been deleted or unpublished. Please choose another.
        </p>
      )}
    </div>
  );
}
