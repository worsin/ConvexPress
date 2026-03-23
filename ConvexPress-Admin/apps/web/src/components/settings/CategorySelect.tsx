/**
 * CategorySelect - Searchable category selector.
 *
 * Used for: default category selection in Writing Settings.
 * Wraps ComboboxField with category data from the real Convex taxonomies.list query.
 */

import { useMemo } from "react";
import type { AnyFieldApi } from "@tanstack/react-form";
import { useQuery } from "convex/react";

import { api } from "@backend/convex/_generated/api";
import type { FieldOption } from "@/types/settings";
import { ComboboxField } from "./fields/ComboboxField";

interface CategorySelectProps {
  /** TanStack Form field API */
  field: AnyFieldApi;
  /** Placeholder text */
  placeholder?: string;
  /** Disabled state */
  disabled?: boolean;
}

export function CategorySelect({
  field,
  placeholder = "Select category...",
  disabled,
}: CategorySelectProps) {
  // Fetch categories from Convex
  const categoriesData = useQuery(api.taxonomies.queries.list, {
    taxonomy: "category",
    perPage: 100,
    orderBy: "name",
    orderDir: "asc",
  });

  const categories: FieldOption[] = useMemo(() => {
    if (!categoriesData?.terms) return [];
    return categoriesData.terms.map((t: { _id: string; name: string; depth?: number }) => ({
      label: t.depth ? `${"\u00A0".repeat(t.depth * 2)}${t.name}` : t.name,
      value: t._id,
    }));
  }, [categoriesData]);

  // Detect stale reference: value is set but not found in loaded categories (Fix #156)
  const currentValue = field.state.value as string | null;
  const isStale =
    currentValue &&
    categoriesData !== undefined &&
    categories.length >= 0 &&
    !categories.some((c) => c.value === currentValue);

  return (
    <div className="flex flex-col gap-1">
      <ComboboxField
        field={field}
        options={categories}
        placeholder={placeholder}
        searchPlaceholder="Search categories..."
        disabled={disabled}
      />
      {isStale && (
        <p className="text-xs text-warning">
          The selected category may have been deleted. Please choose another.
        </p>
      )}
    </div>
  );
}
