/**
 * Widget System - WidgetRenderer
 *
 * Maps a widget type ID to its render component, wraps it in the
 * configured HTML tags, and provides an error boundary.
 *
 * This is the SmithHarper equivalent of WordPress's `the_widget()`.
 */

import type { ElementType } from "react";
import { WidgetErrorBoundary } from "./widget-error-boundary";
import { getWidgetComponent } from "../lib/widget-render-map";

interface WidgetRendererProps {
  widgetType: string;
  title?: string;
  config: Record<string, any>;
  /** HTML tag for the widget wrapper (from the area settings) */
  widgetTag?: string;
  /** HTML tag for the widget title (from the area settings) */
  titleTag?: string;
  /** CSS class for the widget container (from the area settings) */
  widgetClass?: string;
  /** CSS class for the widget title (from the area settings) */
  titleClass?: string;
}

export function WidgetRenderer({
  widgetType,
  title,
  config,
  widgetTag = "section",
  titleTag = "h3",
  widgetClass,
  titleClass,
}: WidgetRendererProps) {
  const Component = getWidgetComponent(widgetType);

  // Unknown widget type - skip silently in production, warn in dev
  if (!Component) {
    if (import.meta.env.DEV) {
      console.warn(
        `[Widget] Unknown widget type "${widgetType}" - skipping render`,
      );
    }
    return null;
  }

  const WrapperTag = widgetTag as ElementType;
  const TitleTag = titleTag as ElementType;

  return (
    <WidgetErrorBoundary widgetType={widgetType}>
      <WrapperTag className={`widget widget-${widgetType} ${widgetClass || ""}`.trim()}>
        {title && (
          <TitleTag className={`widget-title ${titleClass || ""}`.trim()}>
            {title}
          </TitleTag>
        )}
        <div className="widget-content">
          <Component config={config} />
        </div>
      </WrapperTag>
    </WidgetErrorBoundary>
  );
}
