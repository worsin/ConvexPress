/**
 * SEO Breadcrumbs - Build breadcrumb items for a post or page.
 *
 * Constructs a breadcrumb trail from Home -> [Blog] -> Post Title,
 * respecting the global breadcrumb settings (showBlogPage, homeAnchorText).
 *
 * Usage:
 *   const items = buildBreadcrumbItems({
 *     postTitle: "My Post",
 *     postUrl: "https://example.com/blog/my-post",
 *     postType: "post",
 *     siteUrl: "https://example.com",
 *     homeAnchorText: "Home",
 *     showBlogPage: true,
 *     categoryName: "Tech",
 *     categoryUrl: "https://example.com/category/tech",
 *   });
 */

import type { BreadcrumbItem } from "./types";

interface BuildBreadcrumbItemsOptions {
  postTitle: string;
  postUrl: string;
  postType: "post" | "page";
  siteUrl: string;
  homeAnchorText?: string;
  showBlogPage?: boolean;
  categoryName?: string;
  categoryUrl?: string;
}

/**
 * Build an ordered array of breadcrumb items for a post or page.
 *
 * @returns Array of BreadcrumbItem with position numbers starting at 1
 */
export function buildBreadcrumbItems(
  options: BuildBreadcrumbItemsOptions,
): BreadcrumbItem[] {
  const {
    postTitle,
    postUrl,
    postType,
    siteUrl,
    homeAnchorText = "Home",
    showBlogPage = true,
    categoryName,
    categoryUrl,
  } = options;

  const items: BreadcrumbItem[] = [];
  let position = 1;

  // Home
  items.push({
    name: homeAnchorText,
    url: siteUrl,
    position: position++,
  });

  // Blog page (for posts only)
  if (postType === "post" && showBlogPage) {
    items.push({
      name: "Blog",
      url: `${siteUrl}/blog`,
      position: position++,
    });
  }

  // Category (optional, for posts)
  if (postType === "post" && categoryName && categoryUrl) {
    items.push({
      name: categoryName,
      url: categoryUrl,
      position: position++,
    });
  }

  // Current post/page
  items.push({
    name: postTitle,
    url: postUrl,
    position: position++,
  });

  return items;
}

/**
 * Build breadcrumb items for an archive page (category, tag, author).
 */
export function buildArchiveBreadcrumbItems(options: {
  archiveName: string;
  archiveUrl: string;
  archiveType: "category" | "tag" | "author" | "date";
  siteUrl: string;
  homeAnchorText?: string;
}): BreadcrumbItem[] {
  const {
    archiveName,
    archiveUrl,
    archiveType,
    siteUrl,
    homeAnchorText = "Home",
  } = options;

  const items: BreadcrumbItem[] = [];
  let position = 1;

  // Home
  items.push({
    name: homeAnchorText,
    url: siteUrl,
    position: position++,
  });

  // Archive type label
  const typeLabels: Record<string, string> = {
    category: "Categories",
    tag: "Tags",
    author: "Authors",
    date: "Archives",
  };

  items.push({
    name: typeLabels[archiveType] || "Archives",
    url: `${siteUrl}/${archiveType}`,
    position: position++,
  });

  // Current archive
  items.push({
    name: archiveName,
    url: archiveUrl,
    position: position++,
  });

  return items;
}
