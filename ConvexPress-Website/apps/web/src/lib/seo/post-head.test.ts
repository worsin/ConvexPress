import { describe, expect, test } from "bun:test";

import { buildPostSeoHead } from "./post-head";
import type { PostSeoData, SeoSettings } from "./resolve";

const SITE = "https://www.example.com/";

const settings: SeoSettings = {
  titles: {
    separator: "|", siteTitle: "Example Clinic", tagline: "Care that keeps up",
    postTitleTemplate: "%%title%% %%sep%% %%sitename%%", pageTitleTemplate: "%%title%% %%sep%% %%sitename%%",
    postNoindex: false, pageNoindex: false,
  },
  social: { twitterUsername: "exampleclinic", defaultOgImage: "https://www.example.com/share.png", twitterCardType: "summary_large_image", organizationName: "Example Clinic", organizationLogo: "" },
  schema: {
    representType: "organization", organizationName: "Example Clinic", organizationLogoUrl: "", personName: "", personImageUrl: "",
    defaultArticleType: "BlogPosting", defaultPageType: "WebPage", sitelinksSearchBox: false,
  },
  breadcrumbs: { enabled: true, homeAnchorText: "Home", showBlogPage: true },
};

const noOverrides: PostSeoData = {
  seoTitle: null, seoDescription: null, focusKeyphrase: null, additionalKeyphrases: [], canonical: null, noindex: null, nofollow: null,
  ogTitle: null, ogDescription: null, ogImage: null, twitterTitle: null, twitterDescription: null, twitterImage: null,
  schemaType: null, schemaArticleType: null, seoScore: null, readabilityScore: null, cornerstone: false,
};

const post = {
  title: "Five ways to grow", slug: "five-ways-to-grow", excerpt: "Practical steps for a busy practice.",
  publishedAt: Date.UTC(2026, 9, 1), author: { displayName: "Avery Quinn", slug: "avery", avatarUrl: null },
};

type Head = ReturnType<typeof buildPostSeoHead>;
const meta = (head: Head, key: string) => head.meta.filter((tag) => tag.name === key || tag.property === key).map((tag) => tag.content);
const titles = (head: Head) => head.meta.filter((tag) => "title" in tag).map((tag) => tag.title);
/** The graph's article node (its BlogPosting). */
function article(head: Head): unknown {
  const parsed: unknown = JSON.parse(head.scripts.map((script) => script.children).join(""));
  const graph = parsed && typeof parsed === "object" && "@graph" in parsed && Array.isArray(parsed["@graph"]) ? parsed["@graph"] : [];
  return graph.find((node: unknown) => !!node && typeof node === "object" && "@type" in node && node["@type"] === "BlogPosting") ?? null;
}
const canonical = (head: Head) => head.links.filter((link) => link.rel === "canonical").map((link) => link.href);

describe("a blog post's head", () => {
  test("carries one of each tag, with absolute URLs and the Article's structured data", () => {
    const head = buildPostSeoHead(post, noOverrides, settings, SITE);
    expect(titles(head)).toEqual(["Five ways to grow | Example Clinic"]);
    expect(canonical(head)).toEqual(["https://www.example.com/blog/five-ways-to-grow"]);
    expect(meta(head, "og:url")).toEqual(["https://www.example.com/blog/five-ways-to-grow"]);
    expect(meta(head, "og:title")).toHaveLength(1);
    expect(meta(head, "og:type")).toEqual(["article"]);
    expect(meta(head, "description")).toEqual(["Practical steps for a busy practice."]);
    expect(head.scripts.map((script) => script.type)).toEqual(["application/ld+json"]);
    expect(article(head)).toMatchObject({
      url: "https://www.example.com/blog/five-ways-to-grow",
      author: { "@type": "Person", name: "Avery Quinn", url: "https://www.example.com/author/avery" },
    });
  });

  test("a custom canonical path becomes the absolute URL", () => {
    const head = buildPostSeoHead(post, { ...noOverrides, canonical: "/blog/the-original" }, settings, SITE);
    expect(canonical(head)).toEqual(["https://www.example.com/blog/the-original"]);
    expect(meta(head, "og:url")).toEqual(["https://www.example.com/blog/the-original"]);
  });

  test("without the SEO records, the post's own title and excerpt describe it", () => {
    const head = buildPostSeoHead(post, null, null, SITE);
    expect(canonical(head)).toEqual(["https://www.example.com/blog/five-ways-to-grow"]);
    expect(meta(head, "og:type")).toEqual(["article"]);
    expect(meta(head, "description")).toEqual(["Practical steps for a busy practice."]);
  });
});
