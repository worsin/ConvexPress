import { buildIndexablePageHead, getRouteSiteUrl, siteTitled, toAbsoluteUrl } from "./head";
import { buildJsonLdString } from "./jsonld";
import {
  buildArticleJsonLd,
  buildHeadLinks,
  buildMetaTags,
  resolvePostSeoFromQueries,
  type PostForSeoResolution,
  type PostSeoData,
  type SeoSettings,
} from "./resolve";

export interface PostForHead extends Omit<PostForSeoResolution, "type"> {
  author?: { displayName?: string | null; slug?: string | null; avatarUrl?: string | null } | null;
}

/**
 * A blog post's whole SEO head for the route's head(): title, description,
 * robots, canonical, Open Graph, Twitter and the Article's structured data,
 * resolved from the post's own SEO fields and Settings › SEO.
 *
 * It is built in the loader, so the server-rendered page carries it. Crawlers
 * and link previews read that page without running its scripts. Every URL in
 * it is absolute, from the site's configured address.
 *
 * Without the SEO records (the SEO plugin off or unreadable), the post is
 * described by its own title and excerpt.
 */
export function buildPostSeoHead(
  post: PostForHead,
  postSeo: PostSeoData | null,
  settings: SeoSettings | null,
  siteUrl: string = getRouteSiteUrl(),
) {
  const base = siteUrl.replace(/\/+$/, "");
  const path = `/blog/${post.slug}`;
  if (!postSeo || !settings) {
    return buildIndexablePageHead({ path, siteUrl: base, title: siteTitled(post.title), description: post.excerpt ?? undefined, ogType: "article" });
  }
  const document = { ...post, type: "post" as const };
  const resolved = resolvePostSeoFromQueries(document, postSeo, settings, base);
  // A custom canonical may be a path; crawlers and link previews need the full URL.
  const canonical = toAbsoluteUrl(resolved.canonical ?? path, base) ?? `${base}${path}`;
  const seo = { ...resolved, canonical, ogUrl: canonical };
  const graph = buildArticleJsonLd(document, seo, settings, base, {
    name: post.author?.displayName ?? "",
    url: post.author?.slug ? `${base}/author/${post.author.slug}` : base,
    imageUrl: post.author?.avatarUrl ?? undefined,
  });
  return {
    meta: buildMetaTags(seo, base),
    links: buildHeadLinks(seo),
    scripts: [{ type: "application/ld+json", children: buildJsonLdString(graph) }],
  };
}
