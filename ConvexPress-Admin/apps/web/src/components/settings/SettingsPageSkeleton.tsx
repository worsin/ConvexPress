/**
 * SettingsPageSkeleton - Loading state for settings pages.
 *
 * Renders a skeleton layout matching the expected section structure.
 * Prevents layout shift when data loads.
 */

import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

interface SettingsPageSkeletonProps {
  /** Number of sections to render (default: 2) */
  sections?: number;
  /** Number of fields per section (default: 4) */
  fieldsPerSection?: number;
}

export function SettingsPageSkeleton({
  sections = 2,
  fieldsPerSection = 4,
}: SettingsPageSkeletonProps) {
  return (
    <div className="flex flex-col gap-6 pb-20">
      {/* Page title skeleton */}
      <div>
        <Skeleton className="h-7 w-48" />
        <Skeleton className="mt-2 h-4 w-80" />
      </div>

      {/* Section skeletons */}
      {Array.from({ length: sections }).map((_, sectionIndex) => (
        <Card key={sectionIndex}>
          <CardHeader>
            <Skeleton className="h-5 w-36" />
            <Skeleton className="mt-1 h-3.5 w-56" />
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4">
              {Array.from({ length: fieldsPerSection }).map((_, fieldIndex) => (
                <div
                  key={fieldIndex}
                  className="flex flex-col gap-2 md:flex-row md:items-start"
                >
                  {/* Label skeleton */}
                  <div className="md:w-1/3">
                    <Skeleton className="h-4 w-24" />
                  </div>
                  {/* Input skeleton */}
                  <div className="md:w-2/3">
                    <Skeleton className="h-8 w-full" />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
