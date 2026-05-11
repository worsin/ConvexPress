/**
 * PageHierarchyIndicator - "--- " depth prefix for list table hierarchy
 *
 * Renders em-dash prefixes to indicate nesting depth in the admin
 * "All Pages" list table. Matches WordPress's hierarchy display.
 *
 * Examples:
 *   depth 0: (nothing)
 *   depth 1: "--- "
 *   depth 2: "--- --- "
 *   depth 3: "--- --- --- "
 */

interface PageHierarchyIndicatorProps {
  depth: number;
}

export function PageHierarchyIndicator({ depth }: PageHierarchyIndicatorProps) {
  if (depth <= 0) return null;

  const prefix = Array.from({ length: depth }, () => "\u2014 ").join("");

  return (
    <span className="text-muted-foreground mr-1" aria-hidden="true">
      {prefix}
    </span>
  );
}
