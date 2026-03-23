/**
 * Widget System - Widget Render Map
 *
 * Maps widget type IDs to their React render components.
 * Used by WidgetRenderer to resolve which component to render
 * for each widget instance.
 */

import type { ComponentType } from "react";

import { SearchWidget } from "../components/types/search-widget";
import { RecentPostsWidget } from "../components/types/recent-posts-widget";
import { RecentCommentsWidget } from "../components/types/recent-comments-widget";
import { CategoriesWidget } from "../components/types/categories-widget";
import { TagCloudWidget } from "../components/types/tag-cloud-widget";
import { ArchivesWidget } from "../components/types/archives-widget";
import { PagesWidget } from "../components/types/pages-widget";
import { NavMenuWidget } from "../components/types/nav-menu-widget";
import { CustomHtmlWidget } from "../components/types/custom-html-widget";
import { RichTextWidget } from "../components/types/rich-text-widget";
import { ImageWidget } from "../components/types/image-widget";
import { VideoWidget } from "../components/types/video-widget";
import { AudioWidget } from "../components/types/audio-widget";
import { RssFeedWidget } from "../components/types/rss-feed-widget";
import { CalendarWidget } from "../components/types/calendar-widget";
import { SocialLinksWidget } from "../components/types/social-links-widget";

/**
 * Complete widget type ID to render component mapping.
 * All 16 built-in widget types.
 */
export const WIDGET_RENDER_MAP: Record<
  string,
  ComponentType<{ config: Record<string, unknown> }>
> = {
  search: SearchWidget,
  "recent-posts": RecentPostsWidget,
  "recent-comments": RecentCommentsWidget,
  categories: CategoriesWidget,
  "tag-cloud": TagCloudWidget,
  archives: ArchivesWidget,
  pages: PagesWidget,
  "nav-menu": NavMenuWidget,
  "custom-html": CustomHtmlWidget,
  "rich-text": RichTextWidget,
  image: ImageWidget,
  video: VideoWidget,
  audio: AudioWidget,
  "rss-feed": RssFeedWidget,
  calendar: CalendarWidget,
  "social-links": SocialLinksWidget,
};

/**
 * Get the render component for a widget type.
 * Returns undefined if the type is not registered.
 */
export function getWidgetComponent(
  typeId: string,
): ComponentType<{ config: Record<string, unknown> }> | undefined {
  return WIDGET_RENDER_MAP[typeId];
}
