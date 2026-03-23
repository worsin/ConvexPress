/**
 * Widget System - useWidgetVisibility Hook
 *
 * Evaluates visibility conditions for widget areas based on page context.
 */

import { useMemo } from "react";
import {
  shouldShowWidgetArea,
  type PageContext,
  type VisibilityConditions,
} from "../lib/visibility";

/**
 * Determine if a widget area should be shown on the current page.
 *
 * @param conditions - The widget area's visibility conditions
 * @param pageContext - The current page context (type and optional ID)
 * @returns boolean - Whether the area should be displayed
 */
export function useWidgetVisibility(
  conditions: VisibilityConditions | undefined | null,
  pageContext: PageContext,
): boolean {
  return useMemo(
    () => shouldShowWidgetArea(conditions, pageContext),
    [conditions, pageContext],
  );
}
