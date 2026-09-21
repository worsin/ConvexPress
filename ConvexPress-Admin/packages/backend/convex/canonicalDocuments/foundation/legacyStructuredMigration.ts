/** Convert the visible legacy StructuredContent body into editable canonical
 * blocks. The caller retains every original authoring field in its revision. */
import { validateCanonicalTree, CANONICAL_TREE_LIMITS } from "./generated/instances";
import { validateBlockAttrs } from "./generated/schemas";
import { dependencyDescriptors } from "./generated/metadata";
import type { BlockName, CanonicalBlockInstance, CanonicalTree } from "./generated/types";
import { canonicalJson, sha256Hex } from "./shared/fingerprints";
import { sanitizeHref, isExternalUrl } from "./shared/legacyHref";
import { reviewedEmbed, UnsupportedEmbed } from "./shared/embedProviders";
import { LegacyMigrationError } from "./legacyDocumentMigration";

type Path = (string | number)[];
type Hero = { title?: string; subtitle?: string; content?: string; imageId?: string; videoUrl?: string; ctaText?: string; ctaUrl?: string };
type Topic = Omit<Hero, "ctaText" | "ctaUrl">;
export type StructuredArticle = { hero?: Hero; topics?: Topic[]; summary?: { title?: string; content?: string }; sources?: string; tableOfContents?: string };
const heroVisible = (hero?: Hero) => !!hero && !!(hero.subtitle || hero.content || hero.imageId || hero.videoUrl || hero.ctaText);
const topicVisible = (topic: Topic) => !!(topic.title || topic.content || topic.imageId || topic.videoUrl);
export function hasStructuredArticle(source: StructuredArticle): boolean {
  return heroVisible(source.hero) || !!source.topics?.some(topicVisible) || !!(source.summary?.title || source.summary?.content) || !!source.sources?.trim();
}
const slug = (text: string) => text.toLowerCase().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").trim();
const fail = (path: Path, message: string): never => { throw new LegacyMigrationError(path, message); };
const doc = (content: unknown[]) => ({ type: "doc", content: [{ type: "paragraph", content }] });

export function migrateStructuredArticle(source: StructuredArticle & { postId: string; path: string }): CanonicalTree {
  if (!source.postId || !source.path.startsWith("/") || source.path.startsWith("//")) fail([], "A persisted article and site-relative path are required");
  if (new TextEncoder().encode(JSON.stringify(source)).length > CANONICAL_TREE_LIMITS.bytes) fail([], "Structured source exceeds the canonical migration byte limit");
  const validateFields = (row: unknown, fields: string[], path: Path) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) fail(path, "Expected a structured article section");
    for (const [key, value] of Object.entries(row as object)) if (!fields.includes(key) || (value !== undefined && typeof value !== "string")) fail([...path, key], "Unknown or non-text structured field needs a declared adapter");
  };
  if (source.hero) validateFields(source.hero, ["title", "subtitle", "content", "imageId", "videoUrl", "ctaText", "ctaUrl"], ["hero"]);
  if (source.topics !== undefined && (!Array.isArray(source.topics) || source.topics.length > CANONICAL_TREE_LIMITS.nodes)) fail(["topics"], "Expected a bounded topic array");
  source.topics?.forEach((topic, i) => validateFields(topic, ["title", "subtitle", "content", "imageId", "videoUrl"], ["topics", i]));
  if (source.summary) validateFields(source.summary, ["title", "content"], ["summary"]);
  for (const key of ["sources", "tableOfContents"] as const) if (source[key] !== undefined && typeof source[key] !== "string") fail([key], "Expected authored text");
  let count = 0;
  function node(name: BlockName, attrs: unknown, path: Path, children?: CanonicalTree, anchor?: string): CanonicalBlockInstance {
    if (++count > CANONICAL_TREE_LIMITS.nodes) fail(path, "Structured article exceeds the canonical block limit");
    let validated: unknown;
    try { validated = validateBlockAttrs(name, attrs); } catch { fail(path, "The authored value exceeds or differs from the target block contract"); }
    return { id: `migration_${sha256Hex(canonicalJson({ postId: source.postId, path })).slice(0, 32)}`, name, version: dependencyDescriptors[name].version, attrs: validated, ...(children ? { children } : {}), ...(anchor ? { anchor } : {}) } as CanonicalBlockInstance;
  }
  // Legacy links may be bare relative paths. Resolve them against the old public
  // article URL, without embedding an invented host into the saved document.
  const relativeHref = (href: string) => {
    if (/^(https?:|mailto:|tel:|\/|#)/i.test(href)) return href;
    const resolved = new URL(href, `https://migration.invalid${source.path}`);
    return resolved.pathname + resolved.search + resolved.hash;
  };
  const text = (value: string) => ({ type: "text", text: value });
  const link = (value: string, href: string, external: boolean) => ({ ...text(value), marks: [{ type: "link", attrs: { href: relativeHref(href), ...(external ? { target: "_blank" } : {}) } }] });
  function inline(value: string, linkify = false): unknown[] {
    if (!linkify) return value ? [text(value)] : [];
    const result: unknown[] = []; let cursor = 0;
    // Same matching and punctuation behavior as the legacy LinkifiedText view.
    for (const match of value.matchAll(/https?:\/\/[^\s<]+/g)) {
      if (match.index > cursor) result.push(text(value.slice(cursor, match.index)));
      result.push(link(match[0], match[0], true)); cursor = match.index + match[0].length;
    }
    if (cursor < value.length) result.push(text(value.slice(cursor)));
    return result;
  }
  const paragraph = (value: string, path: Path, linkify = false) => node("core/paragraph", { body: doc(inline(value, linkify)) }, path);
  const heading = (value: string, path: Path) => node("core/heading", { level: 2, text: doc(inline(value)) }, path);
  const prose = (value: string | undefined, path: Path) => value ? value.split(/\n\n+/).filter(p => p.trim().length > 0).map((p, i) => paragraph(p, [...path, i], true)) : [];
  function video(url: string, title: string, path: Path) {
    try {
      reviewedEmbed(url, "video");
      return node("core/iframe", { url: { href: url, label: "Open video" }, title }, path);
    } catch (error) { if (!(error instanceof UnsupportedEmbed)) throw error; }
    const href = sanitizeHref(url, { allowRelative: false, allowHash: false, allowMailto: false, allowTel: false });
    return href ? node("core/paragraph", { body: doc([link("Open video", href, true)]) }, path) : paragraph("Embedded content unavailable.", path);
  }
  const blocks: CanonicalTree = [];
  if (heroVisible(source.hero)) {
    const hero = source.hero!, children: CanonicalTree = [];
    if (hero.subtitle) children.push(paragraph(hero.subtitle, ["hero", "subtitle"]));
    if (hero.imageId) children.push(node("core/image", { mediaId: hero.imageId, alt: "Hero image" }, ["hero", "imageId"]));
    if (hero.videoUrl) children.push(video(hero.videoUrl, "Hero video", ["hero", "videoUrl"]));
    children.push(...prose(hero.content, ["hero", "content"]));
    if (hero.ctaText && hero.ctaUrl) {
      const href = sanitizeHref(hero.ctaUrl);
      children.push(href ? node("core/paragraph", { body: doc([link(hero.ctaText, href, isExternalUrl(href))]) }, ["hero", "cta"]) : paragraph(hero.ctaText, ["hero", "cta"]));
    }
    blocks.push(node("core/section", {}, ["hero"], children));
  }
  // The legacy view filters invisible topics before assigning fallback anchors.
  const topics = source.topics?.map((topic, index) => ({ topic, index })).filter(({ topic }) => topicVisible(topic)) ?? [];
  const anchors = topics.map(({ topic }, i) => topic.title ? `topic-${slug(topic.title)}` : `topic-${i}`);
  const toc = source.tableOfContents?.split("\n").map(line => line.trim()).filter(Boolean) ?? [];
  if (toc.length) blocks.push(node("core/section", {}, ["tableOfContents"], [heading("Table of Contents", ["tableOfContents", "title"]), node("core/list", { style: "ordered", items: toc.map((line, i) => ({ text: doc([link(line, `#${anchors[i] ?? `topic-${i}`}`, false)]) })) }, ["tableOfContents", "items"])]));
  topics.forEach(({ topic, index }, i) => {
    const path = ["topics", index], children: CanonicalTree = [];
    if (topic.title) children.push(heading(topic.title, [...path, "title"]));
    if (topic.subtitle) children.push(paragraph(topic.subtitle, [...path, "subtitle"]));
    if (topic.imageId) children.push(node("core/image", { mediaId: topic.imageId, alt: topic.title ?? `Topic ${i + 1} image` }, [...path, "imageId"]));
    if (topic.videoUrl) children.push(video(topic.videoUrl, topic.title || "Topic video", [...path, "videoUrl"]));
    children.push(...prose(topic.content, [...path, "content"]));
    blocks.push(node("core/section", {}, path, children, anchors[i]));
  });
  if (source.summary?.title || source.summary?.content) blocks.push(node("core/section", {}, ["summary"], [...(source.summary.title ? [heading(source.summary.title, ["summary", "title"])] : []), ...prose(source.summary.content, ["summary", "content"])]));
  const sources = source.sources?.split("\n").map(line => line.trim()).filter(Boolean) ?? [];
  if (sources.length) blocks.push(node("core/section", {}, ["sources"], [heading("Sources", ["sources", "title"]), node("core/list", { style: "ordered", items: sources.map(line => ({ text: doc(inline(line, true)) })) }, ["sources", "items"])]));
  try { return validateCanonicalTree(blocks); }
  catch { return fail([], "Structured article contains duplicate/unsupported anchors or exceeds canonical limits; repair the source before conversion"); }
}
