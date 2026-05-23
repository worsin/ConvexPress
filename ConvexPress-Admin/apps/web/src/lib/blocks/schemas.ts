import { z } from "zod";

/**
 * Schema helpers
 *
 * - urlOrEmpty: accepts a valid absolute URL, site-relative URL, hash link,
 *   mailto/tel link, or an empty string (which means "not set yet"). LLMs
 *   frequently generate empty strings for optional URL fields; forcing them to
 *   omit the field entirely is a footgun.
 * - paragraphText: a body-of-copy field. Allows multi-line plain text with
 *   markdown-ish inline emphasis (**bold**, *italic*, [link](url)). The
 *   front-end skill is responsible for rendering.
 */
const urlOrEmpty = z.string().refine(
  (v) => {
    if (v === "") return true;
    if (v.startsWith("/") || v.startsWith("#")) return true;
    if (v.startsWith("mailto:") || v.startsWith("tel:")) return true;
    try {
      new URL(v);
      return true;
    } catch {
      return false;
    }
  },
  { message: "Must be a valid URL or empty" },
);

const paragraphText = (max = 1000) => z.string().max(max).default("");

// ============================================================================
// Wave A — general-purpose content blocks
// ============================================================================

export const paragraphAttrsSchema = z.object({
  /** Body text. Supports light markdown (**bold**, *italic*, [link](url)). */
  body: paragraphText(2000),
});
export type ParagraphAttrs = z.infer<typeof paragraphAttrsSchema>;

export const headingAttrsSchema = z.object({
  /** Heading level — 1 through 6. */
  level: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
    z.literal(6),
  ]).default(2),
  /** Heading text. */
  text: z.string().min(1, "Heading text required").max(200).default("Heading"),
  /** Optional anchor / id slug. */
  anchor: z.string().max(80).default(""),
});
export type HeadingAttrs = z.infer<typeof headingAttrsSchema>;

export const listAttrsSchema = z.object({
  /** List style. */
  style: z.union([
    z.literal("bullet"),
    z.literal("ordered"),
    z.literal("task"),
  ]).default("bullet"),
  /** Items — for task lists, each item has an optional `done` flag. */
  items: z.array(z.object({
    text: z.string().max(500).default(""),
    done: z.boolean().optional(),
  })).default([{ text: "" }]),
});
export type ListAttrs = z.infer<typeof listAttrsSchema>;

export const imageAttrsSchema = z.object({
  /** Convex media document _id. Empty string means "not set yet". */
  mediaId: z.string().default(""),
  /** Alt text for accessibility. */
  alt: z.string().max(200).default(""),
  /** Optional caption shown below the image. */
  caption: z.string().max(300).default(""),
  /** Optional link wrapping the image. */
  href: urlOrEmpty.default(""),
});
export type ImageAttrs = z.infer<typeof imageAttrsSchema>;

export const quoteAttrsSchema = z.object({
  /** The quote text. */
  text: z.string().min(1, "Quote text required").max(800).default(""),
  /** Optional attribution / author. */
  cite: z.string().max(120).default(""),
  /** Optional source URL for the quote. */
  source: urlOrEmpty.default(""),
});
export type QuoteAttrs = z.infer<typeof quoteAttrsSchema>;

export const codeAttrsSchema = z.object({
  /** Language identifier (e.g. typescript, python). */
  language: z.string().max(40).default(""),
  /** The code content. */
  code: z.string().default(""),
  /** Optional filename / title shown above the code block. */
  filename: z.string().max(120).default(""),
});
export type CodeAttrs = z.infer<typeof codeAttrsSchema>;

export const dividerAttrsSchema = z.object({
  /** Optional semantic intent the skill can theme. */
  variant: z.union([
    z.literal("default"),
    z.literal("section"),
    z.literal("subtle"),
  ]).default("default"),
});
export type DividerAttrs = z.infer<typeof dividerAttrsSchema>;

export const spacerAttrsSchema = z.object({
  /** Semantic size — skill chooses actual pixel value. */
  size: z.union([
    z.literal("small"),
    z.literal("medium"),
    z.literal("large"),
    z.literal("xlarge"),
  ]).default("medium"),
});
export type SpacerAttrs = z.infer<typeof spacerAttrsSchema>;

export const embedAttrsSchema = z.object({
  /** URL of the resource to embed. */
  url: urlOrEmpty.default(""),
  /** Optional caption. */
  caption: z.string().max(300).default(""),
});
export type EmbedAttrs = z.infer<typeof embedAttrsSchema>;

// ============================================================================
// Marketing blocks (original 8) — tightened
// ============================================================================

export const heroAttrsSchema = z.object({
  eyebrow: z.string().max(80).default(""),
  title: z.string().min(1, "Title required").max(120).default(""),
  body: paragraphText(600),
  primaryCtaLabel: z.string().max(40).default(""),
  primaryCtaUrl: urlOrEmpty.default(""),
  secondaryCtaLabel: z.string().max(40).default(""),
  secondaryCtaUrl: urlOrEmpty.default(""),
  mediaId: z.string().default(""),
});
export type HeroAttrs = z.infer<typeof heroAttrsSchema>;

export const richTextAttrsSchema = z.object({
  eyebrow: z.string().max(80).default(""),
  heading: z.string().max(120).default(""),
  body: paragraphText(2000),
});
export type RichTextAttrs = z.infer<typeof richTextAttrsSchema>;

export const featureGridAttrsSchema = z.object({
  eyebrow: z.string().max(80).default(""),
  heading: z.string().max(120).default(""),
  body: paragraphText(400),
  items: z.array(z.object({
    title: z.string().max(80).default(""),
    description: z.string().max(300).default(""),
  })).max(12).default([]),
});
export type FeatureGridAttrs = z.infer<typeof featureGridAttrsSchema>;

export const ctaBandAttrsSchema = z.object({
  eyebrow: z.string().max(80).default(""),
  heading: z.string().min(1, "Heading required").max(120).default(""),
  body: paragraphText(400),
  primaryCtaLabel: z.string().max(40).default(""),
  primaryCtaUrl: urlOrEmpty.default(""),
  secondaryCtaLabel: z.string().max(40).default(""),
  secondaryCtaUrl: urlOrEmpty.default(""),
});
export type CtaBandAttrs = z.infer<typeof ctaBandAttrsSchema>;

export const mediaTextAttrsSchema = z.object({
  eyebrow: z.string().max(80).default(""),
  heading: z.string().max(120).default(""),
  body: paragraphText(600),
  mediaId: z.string().default(""),
  mediaAlt: z.string().max(200).default(""),
  /** Side the media appears on. */
  mediaPosition: z.union([z.literal("left"), z.literal("right")]).default("right"),
  ctaLabel: z.string().max(40).default(""),
  ctaUrl: urlOrEmpty.default(""),
});
export type MediaTextAttrs = z.infer<typeof mediaTextAttrsSchema>;

export const testimonialAttrsSchema = z.object({
  eyebrow: z.string().max(80).default(""),
  heading: z.string().max(120).default(""),
  body: paragraphText(400),
  items: z.array(z.object({
    quote: z.string().max(500).default(""),
    name: z.string().max(80).default(""),
    role: z.string().max(80).default(""),
  })).max(20).default([]),
});
export type TestimonialAttrs = z.infer<typeof testimonialAttrsSchema>;

export const pricingCardsAttrsSchema = z.object({
  eyebrow: z.string().max(80).default(""),
  heading: z.string().max(120).default(""),
  body: paragraphText(400),
  plans: z.array(z.object({
    name: z.string().max(40).default(""),
    price: z.string().max(40).default(""),
    description: z.string().max(200).default(""),
    features: z.array(z.string().max(120)).max(20).default([]),
    ctaLabel: z.string().max(40).default(""),
    ctaUrl: urlOrEmpty.default(""),
    featured: z.boolean().default(false),
  })).max(6).default([]),
});
export type PricingCardsAttrs = z.infer<typeof pricingCardsAttrsSchema>;

export const faqAttrsSchema = z.object({
  eyebrow: z.string().max(80).default(""),
  heading: z.string().max(120).default(""),
  body: paragraphText(400),
  items: z.array(z.object({
    question: z.string().max(200).default(""),
    answer: z.string().max(1000).default(""),
  })).max(40).default([]),
});
export type FaqAttrs = z.infer<typeof faqAttrsSchema>;

// ============================================================================
// Wave B — additional marketing blocks
// ============================================================================

export const heroTextOnlyAttrsSchema = z.object({
  eyebrow: z.string().max(80).default(""),
  title: z.string().min(1).max(120).default(""),
  body: paragraphText(600),
  primaryCtaLabel: z.string().max(40).default(""),
  primaryCtaUrl: urlOrEmpty.default(""),
  secondaryCtaLabel: z.string().max(40).default(""),
  secondaryCtaUrl: urlOrEmpty.default(""),
  alignment: z.union([z.literal("center"), z.literal("left")]).default("center"),
});
export type HeroTextOnlyAttrs = z.infer<typeof heroTextOnlyAttrsSchema>;

export const heroSplitAttrsSchema = z.object({
  eyebrow: z.string().max(80).default(""),
  title: z.string().min(1).max(120).default(""),
  body: paragraphText(600),
  primaryCtaLabel: z.string().max(40).default(""),
  primaryCtaUrl: urlOrEmpty.default(""),
  secondaryCtaLabel: z.string().max(40).default(""),
  secondaryCtaUrl: urlOrEmpty.default(""),
  mediaId: z.string().default(""),
  mediaAlt: z.string().max(200).default(""),
  mediaSide: z.union([z.literal("left"), z.literal("right")]).default("right"),
});
export type HeroSplitAttrs = z.infer<typeof heroSplitAttrsSchema>;

export const featureListAlternatingAttrsSchema = z.object({
  eyebrow: z.string().max(80).default(""),
  heading: z.string().max(120).default(""),
  body: paragraphText(400),
  items: z.array(z.object({
    title: z.string().max(80).default(""),
    body: paragraphText(400),
    mediaId: z.string().default(""),
    mediaAlt: z.string().max(200).default(""),
    ctaLabel: z.string().max(40).default(""),
    ctaUrl: urlOrEmpty.default(""),
  })).max(10).default([]),
});
export type FeatureListAlternatingAttrs = z.infer<typeof featureListAlternatingAttrsSchema>;

export const logoCloudAttrsSchema = z.object({
  eyebrow: z.string().max(80).default(""),
  heading: z.string().max(120).default(""),
  logos: z.array(z.object({
    name: z.string().max(80).default(""),
    mediaId: z.string().default(""),
    href: urlOrEmpty.default(""),
  })).max(24).default([]),
});
export type LogoCloudAttrs = z.infer<typeof logoCloudAttrsSchema>;

export const statsBandAttrsSchema = z.object({
  eyebrow: z.string().max(80).default(""),
  heading: z.string().max(120).default(""),
  body: paragraphText(300),
  stats: z.array(z.object({
    value: z.string().max(40).default(""),
    label: z.string().max(80).default(""),
  })).max(6).default([]),
});
export type StatsBandAttrs = z.infer<typeof statsBandAttrsSchema>;

export const teamGridAttrsSchema = z.object({
  eyebrow: z.string().max(80).default(""),
  heading: z.string().max(120).default(""),
  body: paragraphText(400),
  members: z.array(z.object({
    name: z.string().max(80).default(""),
    role: z.string().max(80).default(""),
    bio: z.string().max(400).default(""),
    mediaId: z.string().default(""),
    href: urlOrEmpty.default(""),
  })).max(20).default([]),
});
export type TeamGridAttrs = z.infer<typeof teamGridAttrsSchema>;

export const comparisonTableAttrsSchema = z.object({
  eyebrow: z.string().max(80).default(""),
  heading: z.string().max(120).default(""),
  body: paragraphText(300),
  /** Column headers — first is the row-label column, rest are alternatives. */
  columns: z.array(z.string().max(40)).min(2).max(6).default(["Feature", "Us", "Them"]),
  rows: z.array(z.object({
    label: z.string().max(80).default(""),
    /** Per-column cell value. Aligned by index with `columns` (skip index 0 = label). */
    cells: z.array(z.string().max(80)).default([]),
  })).max(40).default([]),
});
export type ComparisonTableAttrs = z.infer<typeof comparisonTableAttrsSchema>;

export const processStepsAttrsSchema = z.object({
  eyebrow: z.string().max(80).default(""),
  heading: z.string().max(120).default(""),
  body: paragraphText(300),
  steps: z.array(z.object({
    title: z.string().max(80).default(""),
    body: paragraphText(400),
  })).max(12).default([]),
});
export type ProcessStepsAttrs = z.infer<typeof processStepsAttrsSchema>;

export const roadmapTimelineAttrsSchema = z.object({
  eyebrow: z.string().max(80).default(""),
  heading: z.string().max(120).default(""),
  body: paragraphText(300),
  items: z.array(z.object({
    label: z.string().max(40).default(""),
    title: z.string().max(120).default(""),
    body: paragraphText(400),
    status: z.union([z.literal("done"), z.literal("in_progress"), z.literal("planned")]).default("planned"),
  })).max(30).default([]),
});
export type RoadmapTimelineAttrs = z.infer<typeof roadmapTimelineAttrsSchema>;

export const bentoGridAttrsSchema = z.object({
  eyebrow: z.string().max(80).default(""),
  heading: z.string().max(120).default(""),
  body: paragraphText(300),
  /**
   * Bento items. `size` controls relative cell weight; the front-end skill
   * decides actual grid layout.
   */
  items: z.array(z.object({
    title: z.string().max(80).default(""),
    body: paragraphText(400),
    mediaId: z.string().default(""),
    size: z.union([z.literal("small"), z.literal("medium"), z.literal("large")]).default("medium"),
    ctaLabel: z.string().max(40).default(""),
    ctaUrl: urlOrEmpty.default(""),
  })).max(12).default([]),
});
export type BentoGridAttrs = z.infer<typeof bentoGridAttrsSchema>;

// ============================================================================
// Wave C — forms and conversions
// ============================================================================

export const contactFormAttrsSchema = z.object({
  eyebrow: z.string().max(80).default(""),
  heading: z.string().max(120).default(""),
  body: paragraphText(400),
  /** Fields the form should collect. */
  fields: z.array(z.object({
    name: z.string().max(40).default("name"),
    label: z.string().max(80).default("Name"),
    type: z.union([
      z.literal("text"),
      z.literal("email"),
      z.literal("tel"),
      z.literal("textarea"),
      z.literal("select"),
    ]).default("text"),
    required: z.boolean().default(false),
    placeholder: z.string().max(120).default(""),
    /** For type=select. One option per line. */
    options: z.array(z.string().max(80)).default([]),
  })).max(12).default([]),
  submitLabel: z.string().max(40).default("Send message"),
  recipientEmail: z.string().max(200).default(""),
  successMessage: z.string().max(200).default("Thanks — we'll be in touch."),
});
export type ContactFormAttrs = z.infer<typeof contactFormAttrsSchema>;

export const newsletterSignupAttrsSchema = z.object({
  eyebrow: z.string().max(80).default(""),
  heading: z.string().max(120).default(""),
  body: paragraphText(300),
  placeholder: z.string().max(80).default("Your email"),
  submitLabel: z.string().max(40).default("Subscribe"),
  successMessage: z.string().max(200).default("Check your inbox to confirm."),
  variant: z.union([z.literal("inline"), z.literal("large")]).default("inline"),
});
export type NewsletterSignupAttrs = z.infer<typeof newsletterSignupAttrsSchema>;

export const ctaWithFormAttrsSchema = z.object({
  eyebrow: z.string().max(80).default(""),
  heading: z.string().min(1).max(120).default(""),
  body: paragraphText(400),
  placeholder: z.string().max(80).default("you@company.com"),
  submitLabel: z.string().max(40).default("Get started"),
  /** Optional fine-print under the form. */
  fineprint: z.string().max(200).default(""),
});
export type CtaWithFormAttrs = z.infer<typeof ctaWithFormAttrsSchema>;

export const bookingCtaAttrsSchema = z.object({
  eyebrow: z.string().max(80).default(""),
  heading: z.string().min(1).max(120).default(""),
  body: paragraphText(400),
  ctaLabel: z.string().max(40).default("Book a time"),
  ctaUrl: urlOrEmpty.default(""),
  /** Optional embed URL (Cal.com, Calendly, etc.). */
  embedUrl: urlOrEmpty.default(""),
});
export type BookingCtaAttrs = z.infer<typeof bookingCtaAttrsSchema>;

// ============================================================================
// Wave D — content discovery
// ============================================================================

export const latestPostsAttrsSchema = z.object({
  eyebrow: z.string().max(80).default(""),
  heading: z.string().max(120).default(""),
  body: paragraphText(300),
  count: z.number().min(1).max(24).default(3),
  /** Optional category filter (slug). */
  categorySlug: z.string().max(120).default(""),
  /** Optional tag filter (slug). */
  tagSlug: z.string().max(120).default(""),
  showExcerpts: z.boolean().default(true),
  showAuthors: z.boolean().default(true),
});
export type LatestPostsAttrs = z.infer<typeof latestPostsAttrsSchema>;

export const featuredProductsAttrsSchema = z.object({
  eyebrow: z.string().max(80).default(""),
  heading: z.string().max(120).default(""),
  body: paragraphText(300),
  /** Explicit product IDs to feature, in order. Empty = "latest by createdAt". */
  productIds: z.array(z.string()).max(12).default([]),
  count: z.number().min(1).max(12).default(4),
  showPrice: z.boolean().default(true),
});
export type FeaturedProductsAttrs = z.infer<typeof featuredProductsAttrsSchema>;

export const authorBioAttrsSchema = z.object({
  /** Convex user _id of the author. If empty, the page author is used. */
  userId: z.string().default(""),
  /** Override fields — useful for guest authors. */
  name: z.string().max(80).default(""),
  role: z.string().max(80).default(""),
  bio: paragraphText(500),
  mediaId: z.string().default(""),
  links: z.array(z.object({
    label: z.string().max(40).default(""),
    href: urlOrEmpty.default(""),
  })).max(6).default([]),
});
export type AuthorBioAttrs = z.infer<typeof authorBioAttrsSchema>;

export const socialLinksAttrsSchema = z.object({
  heading: z.string().max(80).default(""),
  links: z.array(z.object({
    /** Platform slug used by the skill to pick an icon. */
    platform: z.string().max(40).default(""),
    label: z.string().max(40).default(""),
    href: urlOrEmpty.default(""),
  })).max(12).default([]),
});
export type SocialLinksAttrs = z.infer<typeof socialLinksAttrsSchema>;

export const tagCloudAttrsSchema = z.object({
  heading: z.string().max(80).default(""),
  /** Max number of tags to show. */
  max: z.number().min(1).max(100).default(30),
});
export type TagCloudAttrs = z.infer<typeof tagCloudAttrsSchema>;

// ============================================================================
// Wave E — layout containers
// ============================================================================

export const accordionAttrsSchema = z.object({
  heading: z.string().max(120).default(""),
  body: paragraphText(300),
  items: z.array(z.object({
    title: z.string().max(120).default(""),
    body: paragraphText(2000),
  })).max(40).default([]),
  defaultOpen: z.number().min(0).default(0),
});
export type AccordionAttrs = z.infer<typeof accordionAttrsSchema>;

export const tabsAttrsSchema = z.object({
  heading: z.string().max(120).default(""),
  tabs: z.array(z.object({
    label: z.string().max(40).default(""),
    body: paragraphText(2000),
  })).max(8).default([]),
});
export type TabsAttrs = z.infer<typeof tabsAttrsSchema>;
