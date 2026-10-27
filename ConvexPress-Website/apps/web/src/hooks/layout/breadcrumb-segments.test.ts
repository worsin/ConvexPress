import { describe, expect, test } from "bun:test";

import { breadcrumbJsonLd } from "@/components/layout/Breadcrumbs";
import { breadcrumbSegments } from "./useBreadcrumbs";

const LISTINGS = new Set(["/blog", "/help"]);
const isPage = (path: string) => LISTINGS.has(path);
const layout = [{ routeId: "__root__" }, { routeId: "/_marketing" }];

describe("the breadcrumb trail", () => {
  test("a blog post: Home, the blog it sits under, and the post's own title", () => {
    const trail = breadcrumbSegments(
      [...layout, { routeId: "/_marketing/blog/$slug", params: { slug: "welcome-to-the-blog" }, loaderData: { title: "Welcome to the CaseMedix blog" } }],
      isPage,
    );
    expect(trail).toEqual([{ label: "Home", to: "/" }, { label: "Blog", to: "/blog" }, { label: "Welcome to the CaseMedix blog" }]);
  });

  test("a page: Home and the page's title, with no crumb for the /page prefix", () => {
    const trail = breadcrumbSegments(
      [...layout, { routeId: "/_marketing/page/$", params: { _splat: "services/cme" }, loaderData: { title: "Collection Enforcement" } }],
      isPage,
    );
    expect(trail).toEqual([{ label: "Home", to: "/" }, { label: "Collection Enforcement" }]);
  });

  test("a page whose loader names nothing is named by its address", () => {
    const trail = breadcrumbSegments([...layout, { routeId: "/_marketing/page/$", params: { _splat: "our-story" } }], isPage);
    expect(trail).toEqual([{ label: "Home", to: "/" }, { label: "Our Story" }]);
  });

  test("its structured data names every crumb's absolute URL", () => {
    const data = breadcrumbJsonLd([{ label: "Home", to: "/" }, { label: "Blog", to: "/blog" }, { label: "Welcome" }], "https://www.example.com");
    expect(data.itemListElement).toEqual([
      { "@type": "ListItem", position: 1, name: "Home", item: "https://www.example.com/" },
      { "@type": "ListItem", position: 2, name: "Blog", item: "https://www.example.com/blog" },
      { "@type": "ListItem", position: 3, name: "Welcome" },
    ]);
  });
});
