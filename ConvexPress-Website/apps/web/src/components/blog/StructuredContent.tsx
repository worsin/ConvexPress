/**
 * StructuredContent - Renders AI-generated structured content fields
 *
 * Renders the structured content sections (hero, topics, summary, sources,
 * table of contents) that the AI content generation system produces.
 * These fields live directly on the post record alongside the TipTap content.
 *
 * Rendering order: Hero -> Table of Contents -> Topics -> Summary -> Sources
 *
 * All sections are optional and only render when content is present.
 * Topic sections get id attributes for TOC anchor links.
 */

import { cn } from "@/lib/utils";
import { MediaImage } from "@/components/media/MediaImage";
import type { Id } from "@convexpress-website/backend/generated/dataModel";

// ─── Types ──────────────────────────────────────────────────────────────────

interface HeroData {
  title?: string;
  subtitle?: string;
  content?: string;
  imageId?: string;
  videoUrl?: string;
  ctaText?: string;
  ctaUrl?: string;
}

interface TopicData {
  title?: string;
  subtitle?: string;
  content?: string;
  imageId?: string;
  videoUrl?: string;
}

interface SummaryData {
  title?: string;
  content?: string;
}

export interface StructuredContentProps {
  hero?: HeroData;
  topics?: TopicData[];
  summary?: SummaryData;
  sources?: string;
  tableOfContents?: string;
  className?: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Generate a URL-safe slug from a topic title for anchor linking. */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

/** Check if a hero section has any meaningful content. */
function hasHeroContent(hero?: HeroData): boolean {
  if (!hero) return false;
  return !!(
    hero.subtitle ||
    hero.content ||
    hero.imageId ||
    hero.videoUrl ||
    hero.ctaText
  );
}

/** Check if a topic has any meaningful content. */
function hasTopicContent(topic: TopicData): boolean {
  return !!(topic.title || topic.content || topic.imageId || topic.videoUrl);
}

/** Check if structured content exists on this post. */
export function hasStructuredContent(props: StructuredContentProps): boolean {
  const { hero, topics, summary, sources } = props;
  if (hasHeroContent(hero)) return true;
  if (topics && topics.some(hasTopicContent)) return true;
  if (summary && (summary.title || summary.content)) return true;
  if (sources && sources.trim().length > 0) return true;
  return false;
}

/** Render a video embed (YouTube, Vimeo, or generic iframe). */
function VideoEmbed({ url }: { url: string }) {
  // Normalize YouTube URLs to embed format
  let embedUrl = url;
  const youtubeMatch = url.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/,
  );
  if (youtubeMatch) {
    embedUrl = `https://www.youtube.com/embed/${youtubeMatch[1]}`;
  }
  // Normalize Vimeo URLs
  const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
  if (vimeoMatch) {
    embedUrl = `https://player.vimeo.com/video/${vimeoMatch[1]}`;
  }

  return (
    <div className="relative aspect-video w-full overflow-hidden">
      <iframe
        src={embedUrl}
        title="Video embed"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        className="absolute inset-0 h-full w-full border-0"
      />
    </div>
  );
}

/** Render content text with basic paragraph splitting. */
function ContentText({ text, className }: { text: string; className?: string }) {
  const paragraphs = text.split(/\n\n+/).filter((p) => p.trim().length > 0);
  return (
    <div className={cn("space-y-4", className)}>
      {paragraphs.map((paragraph, i) => (
        <p
          key={i}
          className="text-sm leading-relaxed text-foreground/90"
          dangerouslySetInnerHTML={{ __html: linkifyText(paragraph) }}
        />
      ))}
    </div>
  );
}

/** Convert URLs in text to clickable links. */
function linkifyText(text: string): string {
  return text.replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer" class="text-primary underline hover:text-primary/80">$1</a>',
  );
}

// ─── Section Components ─────────────────────────────────────────────────────

function HeroSection({ hero }: { hero: HeroData }) {
  if (!hasHeroContent(hero)) return null;

  return (
    <section data-slot="structured-hero" className="space-y-4">
      {/* Subtitle */}
      {hero.subtitle && (
        <p className="text-base font-medium text-muted-foreground">
          {hero.subtitle}
        </p>
      )}

      {/* Hero image */}
      {hero.imageId && (
        <figure className="-mx-4 md:-mx-6 lg:-mx-8">
          <MediaImage
            mediaId={hero.imageId as Id<"media">}
            alt="Hero image"
            className="aspect-video w-full object-cover"
            loading="eager"
            sizes="(max-width: 768px) 100vw, 768px"
          />
        </figure>
      )}

      {/* Video embed */}
      {hero.videoUrl && <VideoEmbed url={hero.videoUrl} />}

      {/* Introductory content */}
      {hero.content && <ContentText text={hero.content} />}

      {/* CTA button */}
      {hero.ctaText && hero.ctaUrl && (
        <div>
          <a
            href={hero.ctaUrl}
            className="inline-flex items-center gap-2 bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            target={hero.ctaUrl.startsWith("http") ? "_blank" : undefined}
            rel={hero.ctaUrl.startsWith("http") ? "noopener noreferrer" : undefined}
          >
            {hero.ctaText}
          </a>
        </div>
      )}
    </section>
  );
}

function TableOfContentsSection({ toc, topics }: { toc: string; topics?: TopicData[] }) {
  // Parse table of contents: each line is a TOC entry
  const lines = toc
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) return null;

  return (
    <nav
      data-slot="structured-toc"
      aria-label="Table of contents"
      className="border border-border bg-card/50 p-4"
    >
      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-foreground">
        Table of Contents
      </h2>
      <ol className="list-decimal space-y-1 pl-5">
        {lines.map((line, i) => {
          // Try to link to a matching topic section by index or title
          const matchingTopic = topics?.[i];
          const anchor = matchingTopic?.title
            ? `topic-${slugify(matchingTopic.title)}`
            : `topic-${i}`;

          return (
            <li key={i}>
              <a
                href={`#${anchor}`}
                className="text-sm text-primary underline-offset-2 hover:underline"
              >
                {line}
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function TopicSection({ topic, index }: { topic: TopicData; index: number }) {
  if (!hasTopicContent(topic)) return null;

  const sectionId = topic.title
    ? `topic-${slugify(topic.title)}`
    : `topic-${index}`;

  return (
    <section
      id={sectionId}
      data-slot="structured-topic"
      className="space-y-3 scroll-mt-20"
    >
      {/* Topic title */}
      {topic.title && (
        <h2 className="text-base font-bold leading-tight text-foreground md:text-lg">
          {topic.title}
        </h2>
      )}

      {/* Topic subtitle */}
      {topic.subtitle && (
        <p className="text-sm font-medium text-muted-foreground">
          {topic.subtitle}
        </p>
      )}

      {/* Topic image */}
      {topic.imageId && (
        <figure>
          <MediaImage
            mediaId={topic.imageId as Id<"media">}
            alt={topic.title ?? `Topic ${index + 1} image`}
            className="w-full object-cover"
            sizes="(max-width: 768px) 100vw, 768px"
          />
        </figure>
      )}

      {/* Topic video */}
      {topic.videoUrl && <VideoEmbed url={topic.videoUrl} />}

      {/* Topic body */}
      {topic.content && <ContentText text={topic.content} />}
    </section>
  );
}

function SummarySection({ summary }: { summary: SummaryData }) {
  if (!summary.title && !summary.content) return null;

  return (
    <section
      data-slot="structured-summary"
      className="space-y-3 border-t border-border pt-6"
    >
      {summary.title && (
        <h2 className="text-base font-bold leading-tight text-foreground md:text-lg">
          {summary.title}
        </h2>
      )}
      {summary.content && <ContentText text={summary.content} />}
    </section>
  );
}

function SourcesSection({ sources }: { sources: string }) {
  // Each line is a source reference
  const lines = sources
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) return null;

  return (
    <section
      data-slot="structured-sources"
      className="space-y-3 border-t border-border pt-6"
    >
      <h2 className="text-sm font-bold uppercase tracking-wide text-foreground">
        Sources
      </h2>
      <ol className="list-decimal space-y-1.5 pl-5">
        {lines.map((line, i) => (
          <li
            key={i}
            className="text-xs leading-relaxed text-muted-foreground"
            dangerouslySetInnerHTML={{ __html: linkifyText(line) }}
          />
        ))}
      </ol>
    </section>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

/**
 * Renders all AI-generated structured content fields for a post.
 *
 * Order: Hero -> Table of Contents -> Topics -> Summary -> Sources
 */
export function StructuredContent({
  hero,
  topics,
  summary,
  sources,
  tableOfContents,
  className,
}: StructuredContentProps) {
  const validTopics = topics?.filter(hasTopicContent) ?? [];

  return (
    <div
      data-slot="structured-content"
      className={cn("space-y-8 py-2", className)}
    >
      {/* Hero section */}
      {hero && <HeroSection hero={hero} />}

      {/* Table of Contents */}
      {tableOfContents && (
        <TableOfContentsSection toc={tableOfContents} topics={validTopics} />
      )}

      {/* Topic sections */}
      {validTopics.length > 0 && (
        <div className="space-y-8">
          {validTopics.map((topic, i) => (
            <TopicSection key={i} topic={topic} index={i} />
          ))}
        </div>
      )}

      {/* Summary */}
      {summary && <SummarySection summary={summary} />}

      {/* Sources */}
      {sources && <SourcesSection sources={sources} />}
    </div>
  );
}
