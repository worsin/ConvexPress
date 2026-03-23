/**
 * Widget System - Visibility Condition Logic
 *
 * Evaluates whether a widget area should be visible on the current page.
 * Based on the area's visibilityConditions field.
 */

export type PageType =
  | "home"
  | "blog"
  | "single_post"
  | "single_page"
  | "category_archive"
  | "tag_archive"
  | "author_archive"
  | "search"
  | "404";

export interface PageContext {
  pageType: PageType;
  pageId?: string;
}

export interface VisibilityConditions {
  pageTypes?: PageType[];
  specificPageIds?: string[];
  excludePageIds?: string[];
}

/**
 * Determine if a widget area should be displayed on the current page.
 *
 * Rules:
 *   - If no conditions are set (null/undefined/empty pageTypes), show on all pages
 *   - If specificPageIds includes the current page ID, show
 *   - If excludePageIds includes the current page ID, hide
 *   - If pageTypes includes the current page type, show
 *   - Otherwise, hide
 */
export function shouldShowWidgetArea(
  conditions: VisibilityConditions | undefined | null,
  pageContext: PageContext,
): boolean {
  // No conditions = show everywhere
  if (!conditions) return true;
  if (!conditions.pageTypes?.length && !conditions.specificPageIds?.length) {
    return true;
  }

  // Check specific page exclusions first
  if (
    pageContext.pageId &&
    conditions.excludePageIds?.includes(pageContext.pageId)
  ) {
    return false;
  }

  // Check specific page inclusions
  if (
    pageContext.pageId &&
    conditions.specificPageIds?.includes(pageContext.pageId)
  ) {
    return true;
  }

  // Check page type
  if (conditions.pageTypes?.includes(pageContext.pageType)) {
    return true;
  }

  // If pageTypes were specified but current type isn't in the list, hide
  if (conditions.pageTypes && conditions.pageTypes.length > 0) {
    return false;
  }

  return true;
}
