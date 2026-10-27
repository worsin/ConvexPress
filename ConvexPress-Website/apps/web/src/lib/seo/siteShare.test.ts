import { describe, expect, test } from "bun:test";

import { fallbackRobotsTxt } from "./crawlers";
import type { SeoSettings } from "./resolve";
import { defaultShareImage, homepageTitle, siteDescription, siteJsonLd, siteShareHead, type SiteShare } from "./siteShare";

function seo(overrides: { titles?: Partial<SeoSettings["titles"]>; social?: Partial<SeoSettings["social"]>; schema?: Partial<SeoSettings["schema"]> } = {}): SeoSettings {
  return {
    titles: {
      separator: "|",
      siteTitle: "Northstar",
      tagline: "",
      homepageTitle: "%%sitename%% %%sep%% %%tagline%%",
      homepageDescription: "",
      postTitleTemplate: "%%title%% %%sep%% %%sitename%%",
      pageTitleTemplate: "%%title%% %%sep%% %%sitename%%",
      postNoindex: false,
      pageNoindex: false,
      ...overrides.titles,
    },
    social: {
      twitterUsername: "",
      defaultOgImage: "",
      twitterCardType: "summary_large_image",
      organizationName: "",
      organizationLogo: "",
      ...overrides.social,
    },
    schema: {
      representType: "organization",
      organizationName: "",
      organizationLogoUrl: "",
      personName: "",
      personImageUrl: "",
      defaultArticleType: "BlogPosting",
      defaultPageType: "WebPage",
      sitelinksSearchBox: false,
      ...overrides.schema,
    },
    breadcrumbs: { enabled: true, homeAnchorText: "Home", showBlogPage: true },
  };
}

function share(overrides: Partial<SiteShare> = {}): SiteShare {
  return {
    siteName: "Northstar",
    tagline: "Coffee roasted to order",
    siteUrl: "https://northstar.example/",
    faviconUrl: "",
    seo: seo(),
    ...overrides,
  };
}

describe("site sharing defaults", () => {
  test("every page gets the browser icon, the site's description and its link-preview image", () => {
    const head = siteShareHead(
      share({
        faviconUrl: "/brand/icon.svg",
        seo: seo({ social: { defaultOgImage: "/images/share.png", twitterUsername: "@northstar" } }),
      }),
    );
    expect(head.links).toEqual([
      { rel: "icon", href: "/favicon.ico", sizes: "any" },
      { rel: "icon", href: "/brand/icon.svg", type: "image/svg+xml" },
    ]);
    expect(head.meta).toEqual([
      { name: "description", content: "Coffee roasted to order" },
      { property: "og:description", content: "Coffee roasted to order" },
      { name: "twitter:description", content: "Coffee roasted to order" },
      { property: "og:image", content: "https://northstar.example/images/share.png" },
      { name: "twitter:image", content: "https://northstar.example/images/share.png" },
      { name: "twitter:site", content: "@northstar" },
    ]);
  });

  test("without settings the site still names its icon, and says nothing it doesn't know", () => {
    expect(siteShareHead(null)).toEqual({ meta: [], links: [{ rel: "icon", href: "/favicon.ico", sizes: "any" }] });
    expect(siteShareHead(share({ tagline: "", seo: null })).meta).toEqual([]);
  });

  test("the SEO settings' homepage description and tagline come before the site tagline", () => {
    expect(siteDescription(share({ seo: seo({ titles: { homepageDescription: "Small-batch roasts, shipped weekly." } }) }))).toBe(
      "Small-batch roasts, shipped weekly.",
    );
    expect(siteDescription(share({ seo: seo({ titles: { tagline: "Roasted Tuesday, at your door Thursday" } }) }))).toBe(
      "Roasted Tuesday, at your door Thursday",
    );
  });

  test("the home page title follows the homepage title template", () => {
    expect(homepageTitle(share())).toBe("Northstar | Coffee roasted to order");
    expect(homepageTitle(share({ tagline: "" }))).toBe("Northstar");
    expect(homepageTitle(share({ seo: seo({ titles: { homepageTitle: "%%sitename%% %%sep%% Shop", separator: "–" } }) }))).toBe("Northstar – Shop");
    expect(homepageTitle(share({ seo: null }))).toBe("Northstar | Coffee roasted to order");
  });

  test("an absolute default image is kept as it is", () => {
    expect(defaultShareImage(share({ seo: seo({ social: { defaultOgImage: "https://cdn.example/share.png" } }) }))).toBe("https://cdn.example/share.png");
    expect(defaultShareImage(share())).toBeNull();
  });

  test("the home page describes the site and the organization behind it", () => {
    const graph = siteJsonLd(
      share({ seo: seo({ schema: { organizationName: "Northstar Roasters", organizationLogoUrl: "https://northstar.example/logo.png" }, social: { linkedinUrl: "https://linkedin.example/northstar" } }) }),
    );
    expect(graph).toEqual([
      { "@type": "WebSite", "@id": "https://northstar.example/#website", url: "https://northstar.example", name: "Northstar", description: "Coffee roasted to order", inLanguage: "en-US" },
      {
        "@type": "Organization",
        "@id": "https://northstar.example/#organization",
        name: "Northstar Roasters",
        url: "https://northstar.example",
        logo: { "@type": "ImageObject", "@id": "https://northstar.example/#logo", url: "https://northstar.example/logo.png", contentUrl: "https://northstar.example/logo.png" },
        image: { "@id": "https://northstar.example/#logo" },
        sameAs: ["https://linkedin.example/northstar"],
      },
    ]);
    expect(siteJsonLd(share({ seo: null }))).toEqual([]);
  });

  test("robots.txt names the sitemap by its full URL when the backend can't be reached", () => {
    expect(fallbackRobotsTxt("https://northstar.example/")).toBe(
      "User-agent: *\nDisallow: /admin/\nAllow: /\n\nSitemap: https://northstar.example/sitemap.xml",
    );
    expect(fallbackRobotsTxt("")).toBe("User-agent: *\nDisallow: /admin/\nAllow: /");
  });
});
