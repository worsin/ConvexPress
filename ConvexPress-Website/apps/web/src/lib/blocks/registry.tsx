import type {
  BlockName,
  BlockRendererProps,
  WebsiteBlockDefinition,
} from "./types";
import { MediaImage } from "@/components/media/MediaImage";
import type { Id } from "@convexpress-website/backend/generated/dataModel";
import {
  accordionAttrsSchema,
  authorBioAttrsSchema,
  bentoGridAttrsSchema,
  bookingCtaAttrsSchema,
  codeAttrsSchema,
  comparisonTableAttrsSchema,
  contactFormAttrsSchema,
  ctaBandAttrsSchema,
  ctaWithFormAttrsSchema,
  dividerAttrsSchema,
  embedAttrsSchema,
  faqAttrsSchema,
  featureGridAttrsSchema,
  featureListAlternatingAttrsSchema,
  featuredProductsAttrsSchema,
  headingAttrsSchema,
  heroAttrsSchema,
  heroSplitAttrsSchema,
  heroTextOnlyAttrsSchema,
  imageAttrsSchema,
  latestPostsAttrsSchema,
  listAttrsSchema,
  logoCloudAttrsSchema,
  mediaTextAttrsSchema,
  newsletterSignupAttrsSchema,
  paragraphAttrsSchema,
  pricingCardsAttrsSchema,
  processStepsAttrsSchema,
  quoteAttrsSchema,
  richTextAttrsSchema,
  roadmapTimelineAttrsSchema,
  socialLinksAttrsSchema,
  spacerAttrsSchema,
  statsBandAttrsSchema,
  tabsAttrsSchema,
  tagCloudAttrsSchema,
  teamGridAttrsSchema,
  testimonialAttrsSchema,
  type AccordionAttrs,
  type AuthorBioAttrs,
  type BentoGridAttrs,
  type BookingCtaAttrs,
  type CodeAttrs,
  type ComparisonTableAttrs,
  type ContactFormAttrs,
  type CtaBandAttrs,
  type CtaWithFormAttrs,
  type DividerAttrs,
  type EmbedAttrs,
  type FaqAttrs,
  type FeatureGridAttrs,
  type FeatureListAlternatingAttrs,
  type FeaturedProductsAttrs,
  type HeadingAttrs,
  type HeroAttrs,
  type HeroSplitAttrs,
  type HeroTextOnlyAttrs,
  type ImageAttrs,
  type LatestPostsAttrs,
  type ListAttrs,
  type LogoCloudAttrs,
  type MediaTextAttrs,
  type NewsletterSignupAttrs,
  type ParagraphAttrs,
  type PricingCardsAttrs,
  type ProcessStepsAttrs,
  type QuoteAttrs,
  type RichTextAttrs,
  type RoadmapTimelineAttrs,
  type SocialLinksAttrs,
  type SpacerAttrs,
  type StatsBandAttrs,
  type TabsAttrs,
  type TagCloudAttrs,
  type TeamGridAttrs,
  type TestimonialAttrs,
} from "./schemas";

function splitParagraphs(value: string) {
  return value
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function SectionEyebrow({ value }: { value: string }) {
  if (!value) return null;
  return (
    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {value}
    </p>
  );
}

function SectionBody({ value }: { value: string }) {
  if (!value) return null;
  return (
    <div className="space-y-3">
      {splitParagraphs(value).map((paragraph, index) => (
        <p key={index} className="text-sm leading-7 text-muted-foreground md:text-base">
          {paragraph}
        </p>
      ))}
    </div>
  );
}

function SectionLink({
  label,
  href,
  primary,
}: {
  label: string;
  href: string;
  primary?: boolean;
}) {
  if (!label || !href) return null;
  return (
    <a
      href={href}
      className={
        primary
          ? "inline-flex min-h-11 items-center justify-center bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          : "inline-flex min-h-11 items-center justify-center border border-border px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
      }
    >
      {label}
    </a>
  );
}

function HeroRenderer({ attrs }: BlockRendererProps<HeroAttrs>) {
  return (
    <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
      <div className="space-y-5">
        <SectionEyebrow value={attrs.eyebrow} />
        <h1 className="max-w-3xl text-4xl font-semibold leading-tight md:text-5xl">
          {attrs.title}
        </h1>
        <SectionBody value={attrs.body} />
        <div className="flex flex-wrap gap-3">
          <SectionLink label={attrs.primaryCtaLabel} href={attrs.primaryCtaUrl} primary />
          <SectionLink label={attrs.secondaryCtaLabel} href={attrs.secondaryCtaUrl} />
        </div>
      </div>
      {attrs.mediaId ? (
        <MediaImage
          mediaId={attrs.mediaId as Id<"media">}
          alt={attrs.title}
          className="aspect-[4/3] w-full border border-border object-cover"
          sizes="(max-width: 1024px) 100vw, 45vw"
          preferredSize="large"
        />
      ) : (
        <div className="aspect-[4/3] border border-border bg-muted" aria-label="Hero media placeholder" />
      )}
    </div>
  );
}

function RichTextRenderer({ attrs }: BlockRendererProps<RichTextAttrs>) {
  return (
    <div className="space-y-4">
      <SectionEyebrow value={attrs.eyebrow} />
      {attrs.heading && (
        <h2 className="text-3xl font-semibold leading-tight md:text-4xl">
          {attrs.heading}
        </h2>
      )}
      <SectionBody value={attrs.body} />
    </div>
  );
}

function FeatureGridRenderer({ attrs }: BlockRendererProps<FeatureGridAttrs>) {
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <SectionEyebrow value={attrs.eyebrow} />
        <h2 className="text-3xl font-semibold leading-tight md:text-4xl">
          {attrs.heading}
        </h2>
        <SectionBody value={attrs.body} />
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {attrs.items.map((item, index) => (
          <article key={index} className="border border-border bg-card p-5">
            <h3 className="text-lg font-semibold">{item.title}</h3>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              {item.description}
            </p>
          </article>
        ))}
      </div>
    </div>
  );
}

function CtaBandRenderer({ attrs }: BlockRendererProps<CtaBandAttrs>) {
  return (
    <div className="space-y-5 text-center">
      <SectionEyebrow value={attrs.eyebrow} />
      <h2 className="mx-auto max-w-3xl text-3xl font-semibold leading-tight md:text-4xl">
        {attrs.heading}
      </h2>
      <div className="mx-auto max-w-2xl">
        <SectionBody value={attrs.body} />
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <SectionLink label={attrs.primaryCtaLabel} href={attrs.primaryCtaUrl} primary />
        <SectionLink label={attrs.secondaryCtaLabel} href={attrs.secondaryCtaUrl} />
      </div>
    </div>
  );
}

function MediaTextRenderer({ attrs }: BlockRendererProps<MediaTextAttrs>) {
  const media = attrs.mediaId ? (
    <MediaImage
      mediaId={attrs.mediaId as Id<"media">}
      alt={attrs.mediaAlt || attrs.heading}
      className="aspect-[4/3] w-full border border-border object-cover"
      sizes="(max-width: 1024px) 100vw, 50vw"
      preferredSize="large"
    />
  ) : (
    <div
      className="aspect-[4/3] border border-border bg-muted"
      aria-label={attrs.mediaAlt || "Media placeholder"}
    />
  );
  const copy = (
    <div className="space-y-4">
      <SectionEyebrow value={attrs.eyebrow} />
      <h2 className="text-3xl font-semibold leading-tight md:text-4xl">
        {attrs.heading}
      </h2>
      <SectionBody value={attrs.body} />
      <SectionLink label={attrs.ctaLabel} href={attrs.ctaUrl} primary />
    </div>
  );

  return (
    <div className="grid gap-8 lg:grid-cols-2 lg:items-center">
      {attrs.mediaPosition === "left" ? (
        <>
          {media}
          {copy}
        </>
      ) : (
        <>
          {copy}
          {media}
        </>
      )}
    </div>
  );
}

function TestimonialsRenderer({ attrs }: BlockRendererProps<TestimonialAttrs>) {
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <SectionEyebrow value={attrs.eyebrow} />
        <h2 className="text-3xl font-semibold leading-tight md:text-4xl">
          {attrs.heading}
        </h2>
        <SectionBody value={attrs.body} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {attrs.items.map((item, index) => (
          <figure key={index} className="border border-border bg-card p-5">
            <blockquote className="text-base leading-7 text-foreground">
              {item.quote}
            </blockquote>
            <figcaption className="mt-4 text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">{item.name}</span>
              {item.role ? `, ${item.role}` : ""}
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}

function PricingCardsRenderer({ attrs }: BlockRendererProps<PricingCardsAttrs>) {
  return (
    <div className="space-y-6">
      <div className="space-y-3 text-center">
        <SectionEyebrow value={attrs.eyebrow} />
        <h2 className="text-3xl font-semibold leading-tight md:text-4xl">
          {attrs.heading}
        </h2>
        <div className="mx-auto max-w-2xl">
          <SectionBody value={attrs.body} />
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {attrs.plans.map((plan, index) => (
          <article
            key={index}
            className={
              plan.featured
                ? "border border-primary bg-card p-5 shadow-sm"
                : "border border-border bg-card p-5"
            }
          >
            <h3 className="text-lg font-semibold">{plan.name}</h3>
            <p className="mt-2 text-3xl font-semibold">{plan.price}</p>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              {plan.description}
            </p>
            <ul className="mt-5 space-y-2 text-sm text-muted-foreground">
              {plan.features.map((feature, featureIndex) => (
                <li key={featureIndex}>{feature}</li>
              ))}
            </ul>
            <div className="mt-5">
              <SectionLink label={plan.ctaLabel} href={plan.ctaUrl} primary={plan.featured} />
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function FaqRenderer({ attrs }: BlockRendererProps<FaqAttrs>) {
  return (
    <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
      <div className="space-y-3">
        <SectionEyebrow value={attrs.eyebrow} />
        <h2 className="text-3xl font-semibold leading-tight md:text-4xl">
          {attrs.heading}
        </h2>
        <SectionBody value={attrs.body} />
      </div>
      <div className="space-y-3">
        {attrs.items.map((item, index) => (
          <details key={index} className="border border-border bg-card p-4">
            <summary className="cursor-pointer text-base font-semibold text-foreground">
              {item.question}
            </summary>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              {item.answer}
            </p>
          </details>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Wave A — content block renderers
// ============================================================================

/**
 * Render a body string with minimal inline markdown support:
 *   **bold**, *italic*, [link text](https://...)
 * Splits on blank lines for paragraphs. Anything more advanced belongs in
 * the skill — this is content-shape only.
 */
function renderInlineMarkdown(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  // Order matters: links first (so [foo](bar) doesn't break on *foo* inside).
  // Tokenize iteratively.
  const tokenRe = /(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\(https?:\/\/[^\s)]+\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = tokenRe.exec(text)) !== null) {
    if (match.index > lastIndex) {
      out.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith("**") && token.endsWith("**")) {
      out.push(<strong key={`b${match.index}`}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("*") && token.endsWith("*")) {
      out.push(<em key={`i${match.index}`}>{token.slice(1, -1)}</em>);
    } else if (token.startsWith("[")) {
      const linkMatch = /^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/.exec(token);
      if (linkMatch) {
        out.push(
          <a
            key={`l${match.index}`}
            href={linkMatch[2]}
            className="text-primary underline-offset-4 hover:underline"
            target={linkMatch[2].startsWith("http") ? "_blank" : undefined}
            rel="noopener noreferrer"
          >
            {linkMatch[1]}
          </a>,
        );
      } else {
        out.push(token);
      }
    } else {
      out.push(token);
    }
    lastIndex = match.index + token.length;
  }
  if (lastIndex < text.length) out.push(text.slice(lastIndex));
  return out;
}

function ParagraphRenderer({ attrs }: BlockRendererProps<ParagraphAttrs>) {
  if (!attrs.body) return null;
  const paragraphs = splitParagraphs(attrs.body);
  return (
    <div className="space-y-4 text-base leading-7 text-foreground">
      {paragraphs.map((p, i) => (
        <p key={i}>{renderInlineMarkdown(p)}</p>
      ))}
    </div>
  );
}

function HeadingRenderer({ attrs }: BlockRendererProps<HeadingAttrs>) {
  if (!attrs.text) return null;
  const Tag = `h${attrs.level}` as keyof React.JSX.IntrinsicElements;
  const className = headingClassesByLevel[attrs.level] ?? "text-2xl font-semibold";
  const id = attrs.anchor || undefined;
  return (
    <Tag id={id} className={`${className} text-foreground`}>
      {attrs.text}
    </Tag>
  );
}

const headingClassesByLevel: Record<number, string> = {
  1: "text-4xl font-bold leading-tight md:text-5xl",
  2: "text-3xl font-semibold leading-tight md:text-4xl",
  3: "text-2xl font-semibold leading-snug md:text-3xl",
  4: "text-xl font-semibold leading-snug md:text-2xl",
  5: "text-lg font-semibold leading-snug",
  6: "text-base font-semibold leading-snug",
};

function ListRenderer({ attrs }: BlockRendererProps<ListAttrs>) {
  if (!attrs.items.length) return null;
  if (attrs.style === "task") {
    return (
      <ul className="space-y-2">
        {attrs.items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-base leading-7 text-foreground">
            <input
              type="checkbox"
              checked={item.done ?? false}
              readOnly
              className="mt-1.5 size-4 cursor-default"
              aria-label={item.text}
            />
            <span className={item.done ? "text-muted-foreground line-through" : undefined}>
              {renderInlineMarkdown(item.text)}
            </span>
          </li>
        ))}
      </ul>
    );
  }
  const ListTag = attrs.style === "ordered" ? "ol" : "ul";
  const listClass = attrs.style === "ordered" ? "list-decimal" : "list-disc";
  return (
    <ListTag className={`${listClass} space-y-2 pl-6 text-base leading-7 text-foreground`}>
      {attrs.items.map((item, i) => (
        <li key={i}>{renderInlineMarkdown(item.text)}</li>
      ))}
    </ListTag>
  );
}

function ImageRenderer({ attrs }: BlockRendererProps<ImageAttrs>) {
  if (!attrs.mediaId) return null;
  const figure = (
    <figure>
      <MediaImage
        mediaId={attrs.mediaId as Id<"media">}
        alt={attrs.alt}
        className="h-auto w-full border border-border object-cover"
        sizes="(max-width: 768px) 100vw, 720px"
        preferredSize="large"
      />
      {attrs.caption && (
        <figcaption className="mt-2 text-center text-xs text-muted-foreground">
          {attrs.caption}
        </figcaption>
      )}
    </figure>
  );
  if (attrs.href) {
    return (
      <a href={attrs.href} className="block" target={attrs.href.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer">
        {figure}
      </a>
    );
  }
  return figure;
}

function QuoteRenderer({ attrs }: BlockRendererProps<QuoteAttrs>) {
  if (!attrs.text) return null;
  return (
    <blockquote className="border-l-4 border-primary pl-5 text-base italic leading-7 text-foreground md:text-lg">
      <p>{renderInlineMarkdown(attrs.text)}</p>
      {(attrs.cite || attrs.source) && (
        <footer className="mt-3 text-sm not-italic text-muted-foreground">
          —{" "}
          {attrs.source ? (
            <a href={attrs.source} className="hover:text-foreground" target="_blank" rel="noopener noreferrer">
              {attrs.cite || attrs.source}
            </a>
          ) : (
            attrs.cite
          )}
        </footer>
      )}
    </blockquote>
  );
}

function CodeRenderer({ attrs }: BlockRendererProps<CodeAttrs>) {
  if (!attrs.code) return null;
  return (
    <div className="border border-border bg-muted/30">
      {(attrs.filename || attrs.language) && (
        <div className="flex items-center justify-between border-b border-border px-3 py-1.5 text-xs">
          <span className="font-medium text-foreground">{attrs.filename}</span>
          <span className="text-muted-foreground">{attrs.language}</span>
        </div>
      )}
      <pre className="overflow-x-auto p-4 text-xs leading-6">
        <code>{attrs.code}</code>
      </pre>
    </div>
  );
}

function DividerRenderer({ attrs }: BlockRendererProps<DividerAttrs>) {
  if (attrs.variant === "section") {
    return <hr className="my-4 border-t-2 border-border" />;
  }
  if (attrs.variant === "subtle") {
    return <hr className="my-2 border-t border-border/40" />;
  }
  return <hr className="my-4 border-t border-border" />;
}

function SpacerRenderer({ attrs }: BlockRendererProps<SpacerAttrs>) {
  const heightByEnum: Record<SpacerAttrs["size"], string> = {
    small: "h-4",
    medium: "h-8",
    large: "h-16",
    xlarge: "h-24",
  };
  return <div className={heightByEnum[attrs.size]} aria-hidden="true" />;
}

function EmbedRenderer({ attrs }: BlockRendererProps<EmbedAttrs>) {
  if (!attrs.url) return null;
  const embed = parseEmbedUrl(attrs.url);
  if (embed.kind === "youtube") {
    return (
      <figure className="space-y-2">
        <div className="relative w-full" style={{ paddingBottom: "56.25%" }}>
          <iframe
            src={embed.embedUrl}
            className="absolute inset-0 h-full w-full border-0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            title={attrs.caption || "Embedded video"}
          />
        </div>
        {attrs.caption && <figcaption className="text-center text-xs text-muted-foreground">{attrs.caption}</figcaption>}
      </figure>
    );
  }
  if (embed.kind === "vimeo") {
    return (
      <figure className="space-y-2">
        <div className="relative w-full" style={{ paddingBottom: "56.25%" }}>
          <iframe
            src={embed.embedUrl}
            className="absolute inset-0 h-full w-full border-0"
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
            title={attrs.caption || "Embedded video"}
          />
        </div>
        {attrs.caption && <figcaption className="text-center text-xs text-muted-foreground">{attrs.caption}</figcaption>}
      </figure>
    );
  }
  return (
    <a
      href={attrs.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block border border-border bg-card p-4 text-sm text-foreground hover:bg-muted/50"
    >
      {attrs.caption || attrs.url}
    </a>
  );
}

function parseEmbedUrl(url: string): { kind: "youtube" | "vimeo" | "generic"; embedUrl: string } {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtube.com" || host === "youtu.be" || host === "m.youtube.com") {
      const id = host === "youtu.be" ? u.pathname.slice(1) : u.searchParams.get("v");
      if (id) return { kind: "youtube", embedUrl: `https://www.youtube.com/embed/${id}` };
    }
    if (host.includes("vimeo.com")) {
      const m = /\/(\d+)/.exec(u.pathname);
      if (m) return { kind: "vimeo", embedUrl: `https://player.vimeo.com/video/${m[1]}` };
    }
  } catch {
    // fall through
  }
  return { kind: "generic", embedUrl: url };
}

// ============================================================================
// Wave B — additional marketing block renderers
// ============================================================================

function HeroTextOnlyRenderer({ attrs }: BlockRendererProps<HeroTextOnlyAttrs>) {
  return (
    <div className={`space-y-5 ${attrs.alignment === "center" ? "text-center mx-auto max-w-3xl" : ""}`}>
      <SectionEyebrow value={attrs.eyebrow} />
      <h1 className="text-4xl font-semibold leading-tight md:text-5xl">{attrs.title}</h1>
      <SectionBody value={attrs.body} />
      <div className={`flex flex-wrap gap-3 ${attrs.alignment === "center" ? "justify-center" : ""}`}>
        <SectionLink label={attrs.primaryCtaLabel} href={attrs.primaryCtaUrl} primary />
        <SectionLink label={attrs.secondaryCtaLabel} href={attrs.secondaryCtaUrl} />
      </div>
    </div>
  );
}

function HeroSplitRenderer({ attrs }: BlockRendererProps<HeroSplitAttrs>) {
  const mediaFirst = attrs.mediaSide === "left";
  return (
    <div className="grid gap-8 lg:grid-cols-2 lg:items-center">
      {mediaFirst && attrs.mediaId && (
        <MediaImage
          mediaId={attrs.mediaId as Id<"media">}
          alt={attrs.mediaAlt || attrs.title}
          className="aspect-[4/3] w-full border border-border object-cover"
          sizes="(max-width: 1024px) 100vw, 50vw"
          preferredSize="large"
        />
      )}
      <div className="space-y-5">
        <SectionEyebrow value={attrs.eyebrow} />
        <h1 className="text-4xl font-semibold leading-tight md:text-5xl">{attrs.title}</h1>
        <SectionBody value={attrs.body} />
        <div className="flex flex-wrap gap-3">
          <SectionLink label={attrs.primaryCtaLabel} href={attrs.primaryCtaUrl} primary />
          <SectionLink label={attrs.secondaryCtaLabel} href={attrs.secondaryCtaUrl} />
        </div>
      </div>
      {!mediaFirst && attrs.mediaId && (
        <MediaImage
          mediaId={attrs.mediaId as Id<"media">}
          alt={attrs.mediaAlt || attrs.title}
          className="aspect-[4/3] w-full border border-border object-cover"
          sizes="(max-width: 1024px) 100vw, 50vw"
          preferredSize="large"
        />
      )}
    </div>
  );
}

function FeatureListAlternatingRenderer({ attrs }: BlockRendererProps<FeatureListAlternatingAttrs>) {
  return (
    <div className="space-y-12">
      {(attrs.eyebrow || attrs.heading || attrs.body) && (
        <div className="space-y-3 text-center">
          <SectionEyebrow value={attrs.eyebrow} />
          {attrs.heading && <h2 className="text-3xl font-semibold leading-tight md:text-4xl">{attrs.heading}</h2>}
          <SectionBody value={attrs.body} />
        </div>
      )}
      {attrs.items.map((item, index) => (
        <div key={index} className="grid gap-8 lg:grid-cols-2 lg:items-center">
          <div className={index % 2 === 1 ? "lg:order-2" : ""}>
            {item.mediaId ? (
              <MediaImage
                mediaId={item.mediaId as Id<"media">}
                alt={item.mediaAlt || item.title}
                className="aspect-[4/3] w-full border border-border object-cover"
                sizes="(max-width: 1024px) 100vw, 50vw"
                preferredSize="medium"
              />
            ) : (
              <div className="aspect-[4/3] border border-border bg-muted" aria-hidden="true" />
            )}
          </div>
          <div className="space-y-3">
            <h3 className="text-2xl font-semibold leading-snug md:text-3xl">{item.title}</h3>
            <SectionBody value={item.body} />
            <SectionLink label={item.ctaLabel} href={item.ctaUrl} />
          </div>
        </div>
      ))}
    </div>
  );
}

function LogoCloudRenderer({ attrs }: BlockRendererProps<LogoCloudAttrs>) {
  if (!attrs.logos.length) return null;
  return (
    <div className="space-y-6 text-center">
      <SectionEyebrow value={attrs.eyebrow} />
      {attrs.heading && (
        <h2 className="text-2xl font-semibold leading-snug md:text-3xl">{attrs.heading}</h2>
      )}
      <div className="flex flex-wrap items-center justify-center gap-6 opacity-80">
        {attrs.logos.map((logo, i) => {
          const node = logo.mediaId ? (
            <MediaImage
              mediaId={logo.mediaId as Id<"media">}
              alt={logo.name}
              className="h-8 w-auto object-contain md:h-10"
              preferredSize="thumbnail"
            />
          ) : (
            <span className="text-sm font-medium text-muted-foreground">{logo.name}</span>
          );
          return logo.href ? (
            <a key={i} href={logo.href} target="_blank" rel="noopener noreferrer">
              {node}
            </a>
          ) : (
            <span key={i}>{node}</span>
          );
        })}
      </div>
    </div>
  );
}

function StatsBandRenderer({ attrs }: BlockRendererProps<StatsBandAttrs>) {
  return (
    <div className="space-y-6">
      {(attrs.eyebrow || attrs.heading || attrs.body) && (
        <div className="space-y-3 text-center">
          <SectionEyebrow value={attrs.eyebrow} />
          {attrs.heading && <h2 className="text-3xl font-semibold leading-tight md:text-4xl">{attrs.heading}</h2>}
          <SectionBody value={attrs.body} />
        </div>
      )}
      <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-3">
        {attrs.stats.map((stat, i) => (
          <div key={i} className="border border-border p-6 text-center">
            <div className="text-4xl font-bold tracking-tight text-foreground md:text-5xl">{stat.value}</div>
            <div className="mt-2 text-sm text-muted-foreground">{stat.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TeamGridRenderer({ attrs }: BlockRendererProps<TeamGridAttrs>) {
  return (
    <div className="space-y-8">
      {(attrs.eyebrow || attrs.heading || attrs.body) && (
        <div className="space-y-3 text-center">
          <SectionEyebrow value={attrs.eyebrow} />
          {attrs.heading && <h2 className="text-3xl font-semibold leading-tight md:text-4xl">{attrs.heading}</h2>}
          <SectionBody value={attrs.body} />
        </div>
      )}
      <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {attrs.members.map((member, i) => {
          const inner = (
            <div className="space-y-3 border border-border p-4">
              {member.mediaId ? (
                <MediaImage
                  mediaId={member.mediaId as Id<"media">}
                  alt={member.name}
                  className="aspect-square w-full object-cover"
                  preferredSize="medium"
                />
              ) : (
                <div className="aspect-square w-full bg-muted" aria-hidden="true" />
              )}
              <div>
                <div className="font-semibold text-foreground">{member.name}</div>
                <div className="text-xs text-muted-foreground">{member.role}</div>
                {member.bio && <p className="mt-2 text-sm leading-6 text-muted-foreground">{member.bio}</p>}
              </div>
            </div>
          );
          return member.href ? (
            <a key={i} href={member.href} className="block hover:opacity-90">{inner}</a>
          ) : (
            <div key={i}>{inner}</div>
          );
        })}
      </div>
    </div>
  );
}

function ComparisonTableRenderer({ attrs }: BlockRendererProps<ComparisonTableAttrs>) {
  if (!attrs.columns.length || !attrs.rows.length) return null;
  return (
    <div className="space-y-6">
      {(attrs.eyebrow || attrs.heading || attrs.body) && (
        <div className="space-y-3 text-center">
          <SectionEyebrow value={attrs.eyebrow} />
          {attrs.heading && <h2 className="text-3xl font-semibold leading-tight md:text-4xl">{attrs.heading}</h2>}
          <SectionBody value={attrs.body} />
        </div>
      )}
      <div className="overflow-x-auto border border-border">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              {attrs.columns.map((col, i) => (
                <th key={i} className="px-4 py-3 text-sm font-semibold text-foreground">{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {attrs.rows.map((row, i) => (
              <tr key={i} className="border-b border-border last:border-b-0">
                <td className="px-4 py-3 text-sm font-medium text-foreground">{row.label}</td>
                {row.cells.map((cell, j) => (
                  <td key={j} className="px-4 py-3 text-sm text-muted-foreground">{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ProcessStepsRenderer({ attrs }: BlockRendererProps<ProcessStepsAttrs>) {
  return (
    <div className="space-y-8">
      {(attrs.eyebrow || attrs.heading || attrs.body) && (
        <div className="space-y-3 text-center">
          <SectionEyebrow value={attrs.eyebrow} />
          {attrs.heading && <h2 className="text-3xl font-semibold leading-tight md:text-4xl">{attrs.heading}</h2>}
          <SectionBody value={attrs.body} />
        </div>
      )}
      <ol className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {attrs.steps.map((step, i) => (
          <li key={i} className="border border-border p-5">
            <div className="text-xs font-semibold uppercase tracking-wider text-primary">Step {i + 1}</div>
            <h3 className="mt-2 text-lg font-semibold text-foreground">{step.title}</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{step.body}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

function RoadmapTimelineRenderer({ attrs }: BlockRendererProps<RoadmapTimelineAttrs>) {
  const statusLabel: Record<RoadmapTimelineAttrs["items"][number]["status"], string> = {
    done: "Shipped",
    in_progress: "In progress",
    planned: "Planned",
  };
  const statusClass: Record<RoadmapTimelineAttrs["items"][number]["status"], string> = {
    done: "bg-primary/10 text-primary",
    in_progress: "bg-warning/10 text-warning",
    planned: "bg-muted text-muted-foreground",
  };
  return (
    <div className="space-y-8">
      {(attrs.eyebrow || attrs.heading || attrs.body) && (
        <div className="space-y-3 text-center">
          <SectionEyebrow value={attrs.eyebrow} />
          {attrs.heading && <h2 className="text-3xl font-semibold leading-tight md:text-4xl">{attrs.heading}</h2>}
          <SectionBody value={attrs.body} />
        </div>
      )}
      <ol className="space-y-4 border-l-2 border-border pl-6">
        {attrs.items.map((item, i) => (
          <li key={i} className="relative">
            <span className="absolute -left-[33px] top-2 size-3 rounded-full border-2 border-primary bg-background" aria-hidden="true" />
            <div className="flex flex-wrap items-baseline gap-3">
              <span className="text-xs font-mono text-muted-foreground">{item.label}</span>
              <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${statusClass[item.status]}`}>
                {statusLabel[item.status]}
              </span>
            </div>
            <h3 className="mt-1 text-base font-semibold text-foreground">{item.title}</h3>
            {item.body && <p className="mt-1 text-sm leading-6 text-muted-foreground">{item.body}</p>}
          </li>
        ))}
      </ol>
    </div>
  );
}

function BentoGridRenderer({ attrs }: BlockRendererProps<BentoGridAttrs>) {
  return (
    <div className="space-y-6">
      {(attrs.eyebrow || attrs.heading || attrs.body) && (
        <div className="space-y-3 text-center">
          <SectionEyebrow value={attrs.eyebrow} />
          {attrs.heading && <h2 className="text-3xl font-semibold leading-tight md:text-4xl">{attrs.heading}</h2>}
          <SectionBody value={attrs.body} />
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-3">
        {attrs.items.map((item, i) => {
          const span = item.size === "large" ? "md:col-span-2 md:row-span-2" : item.size === "medium" ? "md:col-span-1" : "";
          return (
            <div key={i} className={`border border-border p-5 ${span}`}>
              {item.mediaId && (
                <MediaImage
                  mediaId={item.mediaId as Id<"media">}
                  alt={item.title}
                  className="mb-3 aspect-video w-full object-cover"
                  preferredSize="medium"
                />
              )}
              <h3 className="text-lg font-semibold text-foreground">{item.title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.body}</p>
              <SectionLink label={item.ctaLabel} href={item.ctaUrl} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// Wave C — forms / conversions
// ============================================================================

function ContactFormRenderer({ attrs }: BlockRendererProps<ContactFormAttrs>) {
  return (
    <form
      data-recipient={attrs.recipientEmail}
      className="mx-auto max-w-xl space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        // Submission wiring lives in the skill / form integration layer.
      }}
    >
      {(attrs.eyebrow || attrs.heading || attrs.body) && (
        <div className="space-y-2">
          <SectionEyebrow value={attrs.eyebrow} />
          {attrs.heading && <h2 className="text-2xl font-semibold text-foreground">{attrs.heading}</h2>}
          <SectionBody value={attrs.body} />
        </div>
      )}
      {attrs.fields.map((field) => (
        <label key={field.name} className="grid gap-1.5">
          <span className="text-sm font-medium text-foreground">{field.label}{field.required ? " *" : ""}</span>
          {field.type === "textarea" ? (
            <textarea
              name={field.name}
              required={field.required}
              placeholder={field.placeholder}
              rows={5}
              className="border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary"
            />
          ) : field.type === "select" ? (
            <select
              name={field.name}
              required={field.required}
              className="h-10 border border-border bg-background px-3 text-sm outline-hidden focus:border-primary"
            >
              <option value="">Choose…</option>
              {field.options.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          ) : (
            <input
              type={field.type}
              name={field.name}
              required={field.required}
              placeholder={field.placeholder}
              className="h-10 border border-border bg-background px-3 text-sm outline-hidden focus:border-primary"
            />
          )}
        </label>
      ))}
      <button type="submit" className="inline-flex min-h-11 items-center justify-center bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
        {attrs.submitLabel}
      </button>
    </form>
  );
}

function NewsletterSignupRenderer({ attrs }: BlockRendererProps<NewsletterSignupAttrs>) {
  const large = attrs.variant === "large";
  return (
    <div className={large ? "border border-border bg-card p-8 text-center" : ""}>
      {(attrs.eyebrow || attrs.heading || attrs.body) && (
        <div className={`space-y-2 ${large ? "mb-6" : "mb-3"}`}>
          <SectionEyebrow value={attrs.eyebrow} />
          {attrs.heading && <h2 className={large ? "text-3xl font-semibold leading-tight md:text-4xl" : "text-xl font-semibold"}>{attrs.heading}</h2>}
          <SectionBody value={attrs.body} />
        </div>
      )}
      <form
        className={`flex flex-wrap gap-2 ${large ? "justify-center" : ""}`}
        onSubmit={(e) => e.preventDefault()}
      >
        <input
          type="email"
          placeholder={attrs.placeholder}
          required
          className="h-10 flex-1 min-w-[200px] border border-border bg-background px-3 text-sm outline-hidden focus:border-primary"
        />
        <button type="submit" className="inline-flex h-10 items-center px-4 text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90">
          {attrs.submitLabel}
        </button>
      </form>
    </div>
  );
}

function CtaWithFormRenderer({ attrs }: BlockRendererProps<CtaWithFormAttrs>) {
  return (
    <div className="space-y-4 border border-border bg-card p-8 text-center">
      <SectionEyebrow value={attrs.eyebrow} />
      {attrs.heading && <h2 className="text-3xl font-semibold leading-tight md:text-4xl">{attrs.heading}</h2>}
      <SectionBody value={attrs.body} />
      <form className="mx-auto flex max-w-md flex-wrap justify-center gap-2" onSubmit={(e) => e.preventDefault()}>
        <input
          type="email"
          placeholder={attrs.placeholder}
          required
          className="h-10 flex-1 min-w-[200px] border border-border bg-background px-3 text-sm outline-hidden focus:border-primary"
        />
        <button type="submit" className="inline-flex h-10 items-center px-4 text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90">
          {attrs.submitLabel}
        </button>
      </form>
      {attrs.fineprint && <p className="text-xs text-muted-foreground">{attrs.fineprint}</p>}
    </div>
  );
}

function BookingCtaRenderer({ attrs }: BlockRendererProps<BookingCtaAttrs>) {
  if (attrs.embedUrl) {
    return (
      <div className="space-y-4">
        <div className="space-y-2 text-center">
          <SectionEyebrow value={attrs.eyebrow} />
          {attrs.heading && <h2 className="text-3xl font-semibold">{attrs.heading}</h2>}
          <SectionBody value={attrs.body} />
        </div>
        <iframe
          src={attrs.embedUrl}
          className="h-[600px] w-full border-0"
          title={attrs.heading || "Booking"}
        />
      </div>
    );
  }
  return (
    <div className="space-y-4 text-center">
      <SectionEyebrow value={attrs.eyebrow} />
      {attrs.heading && <h2 className="text-3xl font-semibold leading-tight md:text-4xl">{attrs.heading}</h2>}
      <SectionBody value={attrs.body} />
      <SectionLink label={attrs.ctaLabel} href={attrs.ctaUrl} primary />
    </div>
  );
}

// ============================================================================
// Wave D — content discovery (Convex-data renderers)
// ============================================================================

function LatestPostsRenderer({ attrs }: BlockRendererProps<LatestPostsAttrs>) {
  // Front-end skill / page-level wiring fetches the data. This is the
  // semantic placeholder — it tells the skill what the user asked for.
  return (
    <div data-block-action="latest-posts" data-count={attrs.count} data-category-slug={attrs.categorySlug} data-tag-slug={attrs.tagSlug} className="space-y-4">
      {(attrs.eyebrow || attrs.heading) && (
        <div className="space-y-2">
          <SectionEyebrow value={attrs.eyebrow} />
          {attrs.heading && <h2 className="text-2xl font-semibold">{attrs.heading}</h2>}
          <SectionBody value={attrs.body} />
        </div>
      )}
      <p className="text-xs text-muted-foreground italic">
        The latest {attrs.count} posts{attrs.categorySlug ? ` in #${attrs.categorySlug}` : ""} render here at request time.
      </p>
    </div>
  );
}

function FeaturedProductsRenderer({ attrs }: BlockRendererProps<FeaturedProductsAttrs>) {
  return (
    <div data-block-action="featured-products" data-count={attrs.count} data-product-ids={attrs.productIds.join(",")} className="space-y-4">
      {(attrs.eyebrow || attrs.heading) && (
        <div className="space-y-2">
          <SectionEyebrow value={attrs.eyebrow} />
          {attrs.heading && <h2 className="text-2xl font-semibold">{attrs.heading}</h2>}
          <SectionBody value={attrs.body} />
        </div>
      )}
      <p className="text-xs text-muted-foreground italic">
        {attrs.productIds.length > 0 ? `${attrs.productIds.length} featured products` : `Latest ${attrs.count} products`} render here.
      </p>
    </div>
  );
}

function AuthorBioRenderer({ attrs }: BlockRendererProps<AuthorBioAttrs>) {
  return (
    <div className="flex items-start gap-4 border border-border p-5">
      {attrs.mediaId && (
        <MediaImage
          mediaId={attrs.mediaId as Id<"media">}
          alt={attrs.name || "Author"}
          className="size-16 shrink-0 rounded-full object-cover"
          preferredSize="thumbnail"
        />
      )}
      <div className="min-w-0 space-y-1">
        <div className="font-semibold text-foreground">{attrs.name || "Author"}</div>
        {attrs.role && <div className="text-xs text-muted-foreground">{attrs.role}</div>}
        {attrs.bio && <p className="mt-1 text-sm leading-6 text-muted-foreground">{attrs.bio}</p>}
        {attrs.links.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-3 text-xs">
            {attrs.links.map((link, i) => (
              <a key={i} href={link.href} className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
                {link.label}
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SocialLinksRenderer({ attrs }: BlockRendererProps<SocialLinksAttrs>) {
  if (!attrs.links.length) return null;
  return (
    <div className="space-y-2">
      {attrs.heading && <h3 className="text-sm font-semibold text-foreground">{attrs.heading}</h3>}
      <ul className="flex flex-wrap gap-3">
        {attrs.links.map((link, i) => (
          <li key={i}>
            <a
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              data-platform={link.platform}
              className="inline-flex items-center gap-1.5 border border-border px-3 py-1.5 text-xs hover:bg-muted/50"
            >
              {link.label || link.platform}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TagCloudRenderer({ attrs }: BlockRendererProps<TagCloudAttrs>) {
  return (
    <div data-block-action="tag-cloud" data-max={attrs.max} className="space-y-2">
      {attrs.heading && <h3 className="text-sm font-semibold text-foreground">{attrs.heading}</h3>}
      <p className="text-xs text-muted-foreground italic">Up to {attrs.max} tags from the site appear here.</p>
    </div>
  );
}

// ============================================================================
// Wave E — layout containers
// ============================================================================

function AccordionRenderer({ attrs }: BlockRendererProps<AccordionAttrs>) {
  return (
    <div className="space-y-4">
      {(attrs.heading || attrs.body) && (
        <div className="space-y-2">
          {attrs.heading && <h2 className="text-2xl font-semibold">{attrs.heading}</h2>}
          <SectionBody value={attrs.body} />
        </div>
      )}
      <div className="border border-border">
        {attrs.items.map((item, i) => (
          <details
            key={i}
            open={i === attrs.defaultOpen}
            className="border-b border-border last:border-b-0"
          >
            <summary className="cursor-pointer px-4 py-3 text-base font-semibold text-foreground hover:bg-muted/30">
              {item.title}
            </summary>
            <div className="px-4 pb-4 text-sm leading-7 text-muted-foreground">
              {item.body.split(/\n{2,}/).map((p, j) => (
                <p key={j}>{p}</p>
              ))}
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}

function TabsRenderer({ attrs }: BlockRendererProps<TabsAttrs>) {
  // Pure CSS tabs via radio inputs — works without JS, simple skin.
  const groupId = `tabs-${Math.random().toString(36).slice(2, 8)}`;
  return (
    <div className="space-y-4">
      {attrs.heading && <h2 className="text-2xl font-semibold">{attrs.heading}</h2>}
      <div className="border border-border">
        <div className="flex flex-wrap border-b border-border">
          {attrs.tabs.map((tab, i) => (
            <label
              key={i}
              className="cursor-pointer border-r border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground last:border-r-0 has-[:checked]:bg-muted/30 has-[:checked]:text-foreground"
            >
              <input type="radio" name={groupId} defaultChecked={i === 0} className="sr-only" />
              {tab.label}
            </label>
          ))}
        </div>
        <div className="p-4 text-sm leading-7 text-muted-foreground">
          {attrs.tabs[0]?.body || ""}
        </div>
      </div>
    </div>
  );
}

export const CORE_BLOCKS = [
  // ── Wave A — content blocks ───────────────────────────────────────────────
  { name: "core/paragraph", title: "Paragraph", version: 1, schema: paragraphAttrsSchema, Renderer: ParagraphRenderer },
  { name: "core/heading", title: "Heading", version: 1, schema: headingAttrsSchema, Renderer: HeadingRenderer },
  { name: "core/list", title: "List", version: 1, schema: listAttrsSchema, Renderer: ListRenderer },
  { name: "core/image", title: "Image", version: 1, schema: imageAttrsSchema, Renderer: ImageRenderer },
  { name: "core/quote", title: "Quote", version: 1, schema: quoteAttrsSchema, Renderer: QuoteRenderer },
  { name: "core/code", title: "Code", version: 1, schema: codeAttrsSchema, Renderer: CodeRenderer },
  { name: "core/divider", title: "Divider", version: 1, schema: dividerAttrsSchema, Renderer: DividerRenderer },
  { name: "core/spacer", title: "Spacer", version: 1, schema: spacerAttrsSchema, Renderer: SpacerRenderer },
  { name: "core/embed", title: "Embed", version: 1, schema: embedAttrsSchema, Renderer: EmbedRenderer },

  // ── Marketing blocks ──────────────────────────────────────────────────────
  {
    name: "core/hero",
    title: "Hero",
    version: 1,
    schema: heroAttrsSchema,
    Renderer: HeroRenderer,
  },
  {
    name: "core/rich-text",
    title: "Rich Text",
    version: 1,
    schema: richTextAttrsSchema,
    Renderer: RichTextRenderer,
  },
  {
    name: "core/feature-grid",
    title: "Feature Grid",
    version: 1,
    schema: featureGridAttrsSchema,
    Renderer: FeatureGridRenderer,
  },
  {
    name: "core/cta-band",
    title: "CTA Band",
    version: 1,
    schema: ctaBandAttrsSchema,
    Renderer: CtaBandRenderer,
  },
  {
    name: "core/media-text",
    title: "Media Text",
    version: 1,
    schema: mediaTextAttrsSchema,
    Renderer: MediaTextRenderer,
  },
  {
    name: "core/testimonials",
    title: "Testimonials",
    version: 1,
    schema: testimonialAttrsSchema,
    Renderer: TestimonialsRenderer,
  },
  {
    name: "core/pricing-cards",
    title: "Pricing Cards",
    version: 1,
    schema: pricingCardsAttrsSchema,
    Renderer: PricingCardsRenderer,
  },
  {
    name: "core/faq",
    title: "FAQ",
    version: 1,
    schema: faqAttrsSchema,
    Renderer: FaqRenderer,
  },

  // ── Wave B — additional marketing ─────────────────────────────────────────
  { name: "core/hero-text-only", title: "Hero (text only)", version: 1, schema: heroTextOnlyAttrsSchema, Renderer: HeroTextOnlyRenderer },
  { name: "core/hero-split", title: "Hero (split)", version: 1, schema: heroSplitAttrsSchema, Renderer: HeroSplitRenderer },
  { name: "core/feature-list-alternating", title: "Feature list (alternating)", version: 1, schema: featureListAlternatingAttrsSchema, Renderer: FeatureListAlternatingRenderer },
  { name: "core/logo-cloud", title: "Logo cloud", version: 1, schema: logoCloudAttrsSchema, Renderer: LogoCloudRenderer },
  { name: "core/stats-band", title: "Stats band", version: 1, schema: statsBandAttrsSchema, Renderer: StatsBandRenderer },
  { name: "core/team-grid", title: "Team grid", version: 1, schema: teamGridAttrsSchema, Renderer: TeamGridRenderer },
  { name: "core/comparison-table", title: "Comparison table", version: 1, schema: comparisonTableAttrsSchema, Renderer: ComparisonTableRenderer },
  { name: "core/process-steps", title: "Process steps", version: 1, schema: processStepsAttrsSchema, Renderer: ProcessStepsRenderer },
  { name: "core/roadmap-timeline", title: "Roadmap timeline", version: 1, schema: roadmapTimelineAttrsSchema, Renderer: RoadmapTimelineRenderer },
  { name: "core/bento-grid", title: "Bento grid", version: 1, schema: bentoGridAttrsSchema, Renderer: BentoGridRenderer },

  // ── Wave C — forms / conversions ──────────────────────────────────────────
  { name: "core/contact-form", title: "Contact form", version: 1, schema: contactFormAttrsSchema, Renderer: ContactFormRenderer },
  { name: "core/newsletter-signup", title: "Newsletter signup", version: 1, schema: newsletterSignupAttrsSchema, Renderer: NewsletterSignupRenderer },
  { name: "core/cta-with-form", title: "CTA with form", version: 1, schema: ctaWithFormAttrsSchema, Renderer: CtaWithFormRenderer },
  { name: "core/booking-cta", title: "Booking CTA", version: 1, schema: bookingCtaAttrsSchema, Renderer: BookingCtaRenderer },

  // ── Wave D — content discovery ────────────────────────────────────────────
  { name: "core/latest-posts", title: "Latest posts", version: 1, schema: latestPostsAttrsSchema, Renderer: LatestPostsRenderer },
  { name: "core/featured-products", title: "Featured products", version: 1, schema: featuredProductsAttrsSchema, Renderer: FeaturedProductsRenderer },
  { name: "core/author-bio", title: "Author bio", version: 1, schema: authorBioAttrsSchema, Renderer: AuthorBioRenderer },
  { name: "core/social-links", title: "Social links", version: 1, schema: socialLinksAttrsSchema, Renderer: SocialLinksRenderer },
  { name: "core/tag-cloud", title: "Tag cloud", version: 1, schema: tagCloudAttrsSchema, Renderer: TagCloudRenderer },

  // ── Wave E — layout containers ────────────────────────────────────────────
  { name: "core/accordion", title: "Accordion", version: 1, schema: accordionAttrsSchema, Renderer: AccordionRenderer },
  { name: "core/tabs", title: "Tabs", version: 1, schema: tabsAttrsSchema, Renderer: TabsRenderer },
] satisfies WebsiteBlockDefinition[];

type DiscoveredBlockModule = {
  default?: WebsiteBlockDefinition;
  definition?: WebsiteBlockDefinition;
};

const OFFICIAL_BLOCK_MODULES = import.meta.glob<DiscoveredBlockModule>(
  "../../blocks/*/manifest.tsx",
  { eager: true },
);
const LOCAL_BLOCK_MODULES = import.meta.glob<DiscoveredBlockModule>(
  "../../blocks.local/*/manifest.tsx",
  { eager: true },
);

function collectDiscoveredBlocks() {
  const seen = new Set(CORE_BLOCKS.map((definition) => String(definition.name)));
  const discovered: WebsiteBlockDefinition[] = [];
  for (const module of [
    ...Object.values(OFFICIAL_BLOCK_MODULES),
    ...Object.values(LOCAL_BLOCK_MODULES),
  ]) {
    const definition = module.default ?? module.definition;
    if (!definition || seen.has(String(definition.name))) continue;
    seen.add(String(definition.name));
    discovered.push(definition);
  }
  return discovered;
}

export const REGISTERED_BLOCKS = [
  ...CORE_BLOCKS,
  ...collectDiscoveredBlocks(),
] satisfies WebsiteBlockDefinition[];

export const BLOCK_REGISTRY = new Map<BlockName, WebsiteBlockDefinition>(
  REGISTERED_BLOCKS.map((definition) => [definition.name, definition]),
);

export function getAllBlockDefinitions() {
  return REGISTERED_BLOCKS;
}

export function getBlockDefinition(name: BlockName) {
  return BLOCK_REGISTRY.get(name);
}
