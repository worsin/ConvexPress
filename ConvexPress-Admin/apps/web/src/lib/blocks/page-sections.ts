import type { PageSection } from "@/lib/page-builder/templates";
import type { ConvexPressBlock } from "./types";

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function arrayValue<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

/**
 * One-shot migration from the legacy `pageSections` page-builder shape into
 * the current `blocks` envelope. The skill now owns presentation, so legacy
 * `shell` (tone/padding/container) is intentionally discarded.
 */
export function pageSectionsToBlocks(sections: PageSection[] | undefined): ConvexPressBlock[] {
  return (sections ?? []).map((section) => {
    const data = section.data ?? {};
    const base = {
      id: section.id || `blk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      version: 1,
    };

    switch (section.type) {
      case "hero":
        return {
          ...base,
          name: "core/hero",
          attrs: {
            eyebrow: stringValue(data.eyebrow),
            title: stringValue(data.title),
            body: stringValue(data.body),
            primaryCtaLabel: stringValue(data.primaryCtaLabel),
            primaryCtaUrl: stringValue(data.primaryCtaUrl),
            secondaryCtaLabel: stringValue(data.secondaryCtaLabel),
            secondaryCtaUrl: stringValue(data.secondaryCtaUrl),
            mediaId: stringValue(data.mediaId),
          },
        };
      case "feature-grid":
        return {
          ...base,
          name: "core/feature-grid",
          attrs: {
            eyebrow: stringValue(data.eyebrow),
            heading: stringValue(data.heading),
            body: stringValue(data.body),
            items: arrayValue<Record<string, unknown>>(data.items).map((item) => ({
              title: stringValue(item.title),
              description: stringValue(item.description),
            })),
          },
        };
      case "cta-band":
        return {
          ...base,
          name: "core/cta-band",
          attrs: {
            eyebrow: stringValue(data.eyebrow),
            heading: stringValue(data.heading),
            body: stringValue(data.body),
            primaryCtaLabel: stringValue(data.primaryCtaLabel),
            primaryCtaUrl: stringValue(data.primaryCtaUrl),
            secondaryCtaLabel: stringValue(data.secondaryCtaLabel),
            secondaryCtaUrl: stringValue(data.secondaryCtaUrl),
          },
        };
      case "story-split":
        return {
          ...base,
          name: "core/media-text",
          attrs: {
            eyebrow: stringValue(data.eyebrow),
            heading: stringValue(data.heading) || stringValue(data.title),
            body: stringValue(data.body) || stringValue(data.content),
            mediaId: stringValue(data.mediaId),
            mediaAlt: stringValue(data.mediaAlt),
            mediaPosition: stringValue(data.mediaPosition) === "left" ? "left" : "right",
            ctaLabel: stringValue(data.ctaLabel),
            ctaUrl: stringValue(data.ctaUrl),
          },
        };
      case "pricing-cards":
        return {
          ...base,
          name: "core/pricing-cards",
          attrs: {
            eyebrow: stringValue(data.eyebrow),
            heading: stringValue(data.heading) || stringValue(data.title),
            body: stringValue(data.body) || stringValue(data.content),
            plans: arrayValue<Record<string, unknown>>(data.plans || data.items).map((plan) => ({
              name: stringValue(plan.name) || stringValue(plan.title),
              price: stringValue(plan.price),
              description: stringValue(plan.description) || stringValue(plan.body),
              features: arrayValue<unknown>(plan.features).map(stringValue).filter(Boolean),
              ctaLabel: stringValue(plan.ctaLabel),
              ctaUrl: stringValue(plan.ctaUrl),
              featured: plan.featured === true,
            })),
          },
        };
      case "testimonial-band":
        return {
          ...base,
          name: "core/testimonials",
          attrs: {
            eyebrow: stringValue(data.eyebrow),
            heading: stringValue(data.heading) || stringValue(data.title),
            body: stringValue(data.body) || stringValue(data.content),
            items: arrayValue<Record<string, unknown>>(data.items || data.testimonials).map((item) => ({
              quote: stringValue(item.quote) || stringValue(item.body),
              name: stringValue(item.name) || stringValue(item.author),
              role: stringValue(item.role) || stringValue(item.title),
            })),
          },
        };
      case "rich-text":
      default:
        return {
          ...base,
          name: "core/rich-text",
          attrs: {
            eyebrow: stringValue(data.eyebrow),
            heading: stringValue(data.heading) || stringValue(data.title),
            body: stringValue(data.body) || stringValue(data.content),
          },
        };
    }
  });
}
