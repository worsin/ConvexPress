import { useQuery } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";

import { cn } from "@/lib/utils";
import { WidgetRenderer } from "@/features/widgets/components/widget-renderer";
import { shouldShowWidgetArea } from "@/features/widgets/lib/visibility";
import type { PageContext, VisibilityConditions } from "@/features/widgets/lib/visibility";

interface WidgetAreaProps {
  slug: string;
  className?: string;
  /** Page context for visibility condition evaluation */
  pageContext?: PageContext;
}

/**
 * Area document type for accessing optional fields from the widgetAreas table.
 * These fields are defined in the schema but may not appear in generated types
 * if Convex codegen is stale. This interface provides proper typing.
 */
interface WidgetAreaDoc {
  widgetTag?: string;
  titleTag?: string;
  widgetClass?: string;
  titleClass?: string;
  wrapperClass?: string;
  visibilityConditions?: VisibilityConditions;
}

/**
 * Renders all widget instances assigned to a specific widget area.
 * This is the website-side counterpart to the admin's widget management UI.
 * Equivalent to WordPress's `dynamic_sidebar()`.
 *
 * Shows nothing if the area has no widgets or while loading.
 * Each area runs its own independent Convex query for isolation.
 * Supports visibility conditions to show/hide based on page context.
 */
export function WidgetArea({ slug, className, pageContext }: WidgetAreaProps) {
  const widgets = useQuery(api.widgets.queries.getAreaWidgets, {
    areaSlug: slug,
  });
  const area = useQuery(api.widgets.queries.getWidgetArea, { slug });

  // Show nothing while loading or if no widgets
  if (widgets === undefined || widgets.length === 0) {
    return null;
  }

  // Evaluate visibility conditions if page context is provided
  const areaDoc = area as WidgetAreaDoc | null | undefined;
  if (pageContext && areaDoc?.visibilityConditions) {
    if (!shouldShowWidgetArea(areaDoc.visibilityConditions, pageContext)) {
      return null;
    }
  }

  // Derive HTML and CSS settings from area config
  const widgetTag = areaDoc?.widgetTag || "section";
  const titleTag = areaDoc?.titleTag || "h3";
  const widgetClass = areaDoc?.widgetClass || "";
  const titleClass = areaDoc?.titleClass || "";

  return (
    <div
      data-slot="widget-area"
      data-widget-area={slug}
      className={cn("space-y-4", className)}
    >
      {widgets.map((widget: (typeof widgets)[number]) => (
        <WidgetRenderer
          key={widget._id}
          widgetType={widget.widgetType}
          title={widget.title}
          config={widget.config || {}}
          widgetTag={widgetTag}
          titleTag={titleTag}
          widgetClass={widgetClass}
          titleClass={titleClass}
        />
      ))}
    </div>
  );
}
