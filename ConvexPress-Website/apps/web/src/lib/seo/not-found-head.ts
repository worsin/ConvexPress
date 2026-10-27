import type { RouterManagedTag } from "@tanstack/react-router";

import { effectiveRobots, siteTitled } from "./head";

/**
 * The head of a page that answered 404: titled "Page not found", not indexed,
 * and naming no canonical address, whatever the routes above it declared.
 */
export function notFoundTags(tags: readonly RouterManagedTag[]): RouterManagedTag[] {
  const kept = tags.filter((tag) => {
    if (tag.tag === "title") return false;
    if (tag.tag === "link" && tag.attrs?.rel === "canonical") return false;
    if (tag.tag === "meta" && tag.attrs?.name === "robots") return false;
    return true;
  });
  return [
    { tag: "title", children: siteTitled("Page not found") },
    { tag: "meta", attrs: { name: "robots", content: effectiveRobots("noindex, follow") } },
    ...kept,
  ];
}
