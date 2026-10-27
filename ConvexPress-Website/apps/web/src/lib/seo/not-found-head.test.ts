import { expect, test } from "bun:test";
import type { RouterManagedTag } from "@tanstack/react-router";

import { notFoundTags } from "./not-found-head";

test("a page that answered 404 is titled so, isn't indexed and names no canonical address", () => {
  const routeTags: RouterManagedTag[] = [
    { tag: "meta", attrs: { charSet: "utf-8" } },
    { tag: "title", children: "Category: none – Example" },
    { tag: "meta", attrs: { name: "robots", content: "index, follow" } },
    { tag: "link", attrs: { rel: "canonical", href: "https://www.example.com/category/none" } },
    { tag: "link", attrs: { rel: "icon", href: "/favicon.ico" } },
  ];
  const tags = notFoundTags(routeTags);
  const titles = tags.filter((tag) => tag.tag === "title").map((tag) => tag.children);
  expect(titles).toHaveLength(1);
  expect(String(titles[0])).toContain("Page not found");
  const robots = tags.filter((tag) => tag.tag === "meta" && tag.attrs?.name === "robots").map((tag) => tag.attrs?.content);
  expect(robots).toEqual(["noindex, follow"]);
  expect(tags.some((tag) => tag.tag === "link" && tag.attrs?.rel === "canonical")).toBe(false);
  // Everything else the routes declared stays.
  expect(tags.some((tag) => tag.tag === "link" && tag.attrs?.rel === "icon")).toBe(true);
  expect(tags.some((tag) => tag.tag === "meta" && tag.attrs?.charSet === "utf-8")).toBe(true);
});
