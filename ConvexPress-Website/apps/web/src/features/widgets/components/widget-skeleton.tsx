/**
 * Widget System - WidgetSkeleton
 *
 * Loading skeleton displayed while widget data is loading.
 */

export function WidgetSkeleton() {
  return (
    <div className="animate-pulse space-y-2">
      <div className="h-4 w-24 rounded bg-muted" />
      <div className="space-y-1.5">
        <div className="h-3 w-full rounded bg-muted" />
        <div className="h-3 w-3/4 rounded bg-muted" />
        <div className="h-3 w-1/2 rounded bg-muted" />
      </div>
    </div>
  );
}
