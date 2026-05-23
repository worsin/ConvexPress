import { z } from "zod";

/**
 * Website-side schemas are intentionally looser than the admin schemas —
 * the admin enforces strict constraints on edit/save, but the website's
 * job is to RENDER whatever data exists. Tolerance > strictness here.
 */

// ============================================================================
// Wave A — general-purpose content blocks
// ============================================================================

export const paragraphAttrsSchema = z.object({
  body: z.string().default(""),
});
export type ParagraphAttrs = z.infer<typeof paragraphAttrsSchema>;

export const headingAttrsSchema = z.object({
  level: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6)]).default(2),
  text: z.string().default(""),
  anchor: z.string().default(""),
});
export type HeadingAttrs = z.infer<typeof headingAttrsSchema>;

export const listAttrsSchema = z.object({
  style: z.union([z.literal("bullet"), z.literal("ordered"), z.literal("task")]).default("bullet"),
  items: z.array(z.object({
    text: z.string().default(""),
    done: z.boolean().optional(),
  })).default([]),
});
export type ListAttrs = z.infer<typeof listAttrsSchema>;

export const imageAttrsSchema = z.object({
  mediaId: z.string().default(""),
  alt: z.string().default(""),
  caption: z.string().default(""),
  href: z.string().default(""),
});
export type ImageAttrs = z.infer<typeof imageAttrsSchema>;

export const quoteAttrsSchema = z.object({
  text: z.string().default(""),
  cite: z.string().default(""),
  source: z.string().default(""),
});
export type QuoteAttrs = z.infer<typeof quoteAttrsSchema>;

export const codeAttrsSchema = z.object({
  language: z.string().default(""),
  code: z.string().default(""),
  filename: z.string().default(""),
});
export type CodeAttrs = z.infer<typeof codeAttrsSchema>;

export const dividerAttrsSchema = z.object({
  variant: z.union([z.literal("default"), z.literal("section"), z.literal("subtle")]).default("default"),
});
export type DividerAttrs = z.infer<typeof dividerAttrsSchema>;

export const spacerAttrsSchema = z.object({
  size: z.union([z.literal("small"), z.literal("medium"), z.literal("large"), z.literal("xlarge")]).default("medium"),
});
export type SpacerAttrs = z.infer<typeof spacerAttrsSchema>;

export const embedAttrsSchema = z.object({
  url: z.string().default(""),
  caption: z.string().default(""),
});
export type EmbedAttrs = z.infer<typeof embedAttrsSchema>;

// ============================================================================
// Marketing blocks (originals)
// ============================================================================

export const heroAttrsSchema = z.object({
  eyebrow: z.string().default(""),
  title: z.string().default(""),
  body: z.string().default(""),
  primaryCtaLabel: z.string().default(""),
  primaryCtaUrl: z.string().default(""),
  secondaryCtaLabel: z.string().default(""),
  secondaryCtaUrl: z.string().default(""),
  mediaId: z.string().default(""),
});
export type HeroAttrs = z.infer<typeof heroAttrsSchema>;

export const richTextAttrsSchema = z.object({
  eyebrow: z.string().default(""),
  heading: z.string().default(""),
  body: z.string().default(""),
});
export type RichTextAttrs = z.infer<typeof richTextAttrsSchema>;

export const featureGridAttrsSchema = z.object({
  eyebrow: z.string().default(""),
  heading: z.string().default(""),
  body: z.string().default(""),
  items: z.array(z.object({
    title: z.string().default(""),
    description: z.string().default(""),
  })).default([]),
});
export type FeatureGridAttrs = z.infer<typeof featureGridAttrsSchema>;

export const ctaBandAttrsSchema = z.object({
  eyebrow: z.string().default(""),
  heading: z.string().default(""),
  body: z.string().default(""),
  primaryCtaLabel: z.string().default(""),
  primaryCtaUrl: z.string().default(""),
  secondaryCtaLabel: z.string().default(""),
  secondaryCtaUrl: z.string().default(""),
});
export type CtaBandAttrs = z.infer<typeof ctaBandAttrsSchema>;

export const mediaTextAttrsSchema = z.object({
  eyebrow: z.string().default(""),
  heading: z.string().default(""),
  body: z.string().default(""),
  mediaId: z.string().default(""),
  mediaAlt: z.string().default(""),
  mediaPosition: z.union([z.literal("left"), z.literal("right")]).default("right"),
  ctaLabel: z.string().default(""),
  ctaUrl: z.string().default(""),
});
export type MediaTextAttrs = z.infer<typeof mediaTextAttrsSchema>;

export const testimonialAttrsSchema = z.object({
  eyebrow: z.string().default(""),
  heading: z.string().default(""),
  body: z.string().default(""),
  items: z.array(z.object({
    quote: z.string().default(""),
    name: z.string().default(""),
    role: z.string().default(""),
  })).default([]),
});
export type TestimonialAttrs = z.infer<typeof testimonialAttrsSchema>;

export const pricingCardsAttrsSchema = z.object({
  eyebrow: z.string().default(""),
  heading: z.string().default(""),
  body: z.string().default(""),
  plans: z.array(z.object({
    name: z.string().default(""),
    price: z.string().default(""),
    description: z.string().default(""),
    features: z.array(z.string()).default([]),
    ctaLabel: z.string().default(""),
    ctaUrl: z.string().default(""),
    featured: z.boolean().default(false),
  })).default([]),
});
export type PricingCardsAttrs = z.infer<typeof pricingCardsAttrsSchema>;

export const faqAttrsSchema = z.object({
  eyebrow: z.string().default(""),
  heading: z.string().default(""),
  body: z.string().default(""),
  items: z.array(z.object({
    question: z.string().default(""),
    answer: z.string().default(""),
  })).default([]),
});
export type FaqAttrs = z.infer<typeof faqAttrsSchema>;

// ============================================================================
// Wave B — additional marketing blocks
// ============================================================================

export const heroTextOnlyAttrsSchema = z.object({
  eyebrow: z.string().default(""),
  title: z.string().default(""),
  body: z.string().default(""),
  primaryCtaLabel: z.string().default(""),
  primaryCtaUrl: z.string().default(""),
  secondaryCtaLabel: z.string().default(""),
  secondaryCtaUrl: z.string().default(""),
  alignment: z.union([z.literal("center"), z.literal("left")]).default("center"),
});
export type HeroTextOnlyAttrs = z.infer<typeof heroTextOnlyAttrsSchema>;

export const heroSplitAttrsSchema = z.object({
  eyebrow: z.string().default(""),
  title: z.string().default(""),
  body: z.string().default(""),
  primaryCtaLabel: z.string().default(""),
  primaryCtaUrl: z.string().default(""),
  secondaryCtaLabel: z.string().default(""),
  secondaryCtaUrl: z.string().default(""),
  mediaId: z.string().default(""),
  mediaAlt: z.string().default(""),
  mediaSide: z.union([z.literal("left"), z.literal("right")]).default("right"),
});
export type HeroSplitAttrs = z.infer<typeof heroSplitAttrsSchema>;

export const featureListAlternatingAttrsSchema = z.object({
  eyebrow: z.string().default(""),
  heading: z.string().default(""),
  body: z.string().default(""),
  items: z.array(z.object({
    title: z.string().default(""),
    body: z.string().default(""),
    mediaId: z.string().default(""),
    mediaAlt: z.string().default(""),
    ctaLabel: z.string().default(""),
    ctaUrl: z.string().default(""),
  })).default([]),
});
export type FeatureListAlternatingAttrs = z.infer<typeof featureListAlternatingAttrsSchema>;

export const logoCloudAttrsSchema = z.object({
  eyebrow: z.string().default(""),
  heading: z.string().default(""),
  logos: z.array(z.object({
    name: z.string().default(""),
    mediaId: z.string().default(""),
    href: z.string().default(""),
  })).default([]),
});
export type LogoCloudAttrs = z.infer<typeof logoCloudAttrsSchema>;

export const statsBandAttrsSchema = z.object({
  eyebrow: z.string().default(""),
  heading: z.string().default(""),
  body: z.string().default(""),
  stats: z.array(z.object({
    value: z.string().default(""),
    label: z.string().default(""),
  })).default([]),
});
export type StatsBandAttrs = z.infer<typeof statsBandAttrsSchema>;

export const teamGridAttrsSchema = z.object({
  eyebrow: z.string().default(""),
  heading: z.string().default(""),
  body: z.string().default(""),
  members: z.array(z.object({
    name: z.string().default(""),
    role: z.string().default(""),
    bio: z.string().default(""),
    mediaId: z.string().default(""),
    href: z.string().default(""),
  })).default([]),
});
export type TeamGridAttrs = z.infer<typeof teamGridAttrsSchema>;

export const comparisonTableAttrsSchema = z.object({
  eyebrow: z.string().default(""),
  heading: z.string().default(""),
  body: z.string().default(""),
  columns: z.array(z.string()).default([]),
  rows: z.array(z.object({
    label: z.string().default(""),
    cells: z.array(z.string()).default([]),
  })).default([]),
});
export type ComparisonTableAttrs = z.infer<typeof comparisonTableAttrsSchema>;

export const processStepsAttrsSchema = z.object({
  eyebrow: z.string().default(""),
  heading: z.string().default(""),
  body: z.string().default(""),
  steps: z.array(z.object({
    title: z.string().default(""),
    body: z.string().default(""),
  })).default([]),
});
export type ProcessStepsAttrs = z.infer<typeof processStepsAttrsSchema>;

export const roadmapTimelineAttrsSchema = z.object({
  eyebrow: z.string().default(""),
  heading: z.string().default(""),
  body: z.string().default(""),
  items: z.array(z.object({
    label: z.string().default(""),
    title: z.string().default(""),
    body: z.string().default(""),
    status: z.union([z.literal("done"), z.literal("in_progress"), z.literal("planned")]).default("planned"),
  })).default([]),
});
export type RoadmapTimelineAttrs = z.infer<typeof roadmapTimelineAttrsSchema>;

export const bentoGridAttrsSchema = z.object({
  eyebrow: z.string().default(""),
  heading: z.string().default(""),
  body: z.string().default(""),
  items: z.array(z.object({
    title: z.string().default(""),
    body: z.string().default(""),
    mediaId: z.string().default(""),
    size: z.union([z.literal("small"), z.literal("medium"), z.literal("large")]).default("medium"),
    ctaLabel: z.string().default(""),
    ctaUrl: z.string().default(""),
  })).default([]),
});
export type BentoGridAttrs = z.infer<typeof bentoGridAttrsSchema>;

// ============================================================================
// Wave C — forms / conversions
// ============================================================================

export const contactFormAttrsSchema = z.object({
  eyebrow: z.string().default(""),
  heading: z.string().default(""),
  body: z.string().default(""),
  fields: z.array(z.object({
    name: z.string().default("field"),
    label: z.string().default("Field"),
    type: z.union([z.literal("text"), z.literal("email"), z.literal("tel"), z.literal("textarea"), z.literal("select")]).default("text"),
    required: z.boolean().default(false),
    placeholder: z.string().default(""),
    options: z.array(z.string()).default([]),
  })).default([]),
  submitLabel: z.string().default("Send"),
  recipientEmail: z.string().default(""),
  successMessage: z.string().default(""),
});
export type ContactFormAttrs = z.infer<typeof contactFormAttrsSchema>;

export const newsletterSignupAttrsSchema = z.object({
  eyebrow: z.string().default(""),
  heading: z.string().default(""),
  body: z.string().default(""),
  placeholder: z.string().default("Your email"),
  submitLabel: z.string().default("Subscribe"),
  successMessage: z.string().default(""),
  variant: z.union([z.literal("inline"), z.literal("large")]).default("inline"),
});
export type NewsletterSignupAttrs = z.infer<typeof newsletterSignupAttrsSchema>;

export const ctaWithFormAttrsSchema = z.object({
  eyebrow: z.string().default(""),
  heading: z.string().default(""),
  body: z.string().default(""),
  placeholder: z.string().default(""),
  submitLabel: z.string().default("Get started"),
  fineprint: z.string().default(""),
});
export type CtaWithFormAttrs = z.infer<typeof ctaWithFormAttrsSchema>;

export const bookingCtaAttrsSchema = z.object({
  eyebrow: z.string().default(""),
  heading: z.string().default(""),
  body: z.string().default(""),
  ctaLabel: z.string().default(""),
  ctaUrl: z.string().default(""),
  embedUrl: z.string().default(""),
});
export type BookingCtaAttrs = z.infer<typeof bookingCtaAttrsSchema>;

// ============================================================================
// Wave D — content discovery
// ============================================================================

export const latestPostsAttrsSchema = z.object({
  eyebrow: z.string().default(""),
  heading: z.string().default(""),
  body: z.string().default(""),
  count: z.number().default(3),
  categorySlug: z.string().default(""),
  tagSlug: z.string().default(""),
  showExcerpts: z.boolean().default(true),
  showAuthors: z.boolean().default(true),
});
export type LatestPostsAttrs = z.infer<typeof latestPostsAttrsSchema>;

export const featuredProductsAttrsSchema = z.object({
  eyebrow: z.string().default(""),
  heading: z.string().default(""),
  body: z.string().default(""),
  productIds: z.array(z.string()).default([]),
  count: z.number().default(4),
  showPrice: z.boolean().default(true),
});
export type FeaturedProductsAttrs = z.infer<typeof featuredProductsAttrsSchema>;

export const authorBioAttrsSchema = z.object({
  userId: z.string().default(""),
  name: z.string().default(""),
  role: z.string().default(""),
  bio: z.string().default(""),
  mediaId: z.string().default(""),
  links: z.array(z.object({
    label: z.string().default(""),
    href: z.string().default(""),
  })).default([]),
});
export type AuthorBioAttrs = z.infer<typeof authorBioAttrsSchema>;

export const socialLinksAttrsSchema = z.object({
  heading: z.string().default(""),
  links: z.array(z.object({
    platform: z.string().default(""),
    label: z.string().default(""),
    href: z.string().default(""),
  })).default([]),
});
export type SocialLinksAttrs = z.infer<typeof socialLinksAttrsSchema>;

export const tagCloudAttrsSchema = z.object({
  heading: z.string().default(""),
  max: z.number().default(30),
});
export type TagCloudAttrs = z.infer<typeof tagCloudAttrsSchema>;

// ============================================================================
// Wave E — layout containers
// ============================================================================

export const accordionAttrsSchema = z.object({
  heading: z.string().default(""),
  body: z.string().default(""),
  items: z.array(z.object({
    title: z.string().default(""),
    body: z.string().default(""),
  })).default([]),
  defaultOpen: z.number().default(0),
});
export type AccordionAttrs = z.infer<typeof accordionAttrsSchema>;

export const tabsAttrsSchema = z.object({
  heading: z.string().default(""),
  tabs: z.array(z.object({
    label: z.string().default(""),
    body: z.string().default(""),
  })).default([]),
});
export type TabsAttrs = z.infer<typeof tabsAttrsSchema>;
