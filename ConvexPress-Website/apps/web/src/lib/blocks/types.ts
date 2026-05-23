import type { ComponentType, ReactNode } from "react";
import type { ZodType } from "zod";
// Re-export to avoid relying on the `React` namespace name in jsx-runtime mode.
export type { ReactNode };

export type BlockContentMode = "article" | "blocks";

export type CoreBlockName =
  // Wave A — content blocks
  | "core/paragraph"
  | "core/heading"
  | "core/list"
  | "core/image"
  | "core/quote"
  | "core/code"
  | "core/divider"
  | "core/spacer"
  | "core/embed"
  // Marketing blocks (original 8)
  | "core/hero"
  | "core/rich-text"
  | "core/feature-grid"
  | "core/cta-band"
  | "core/media-text"
  | "core/testimonials"
  | "core/pricing-cards"
  | "core/faq"
  // Wave B — additional marketing
  | "core/hero-text-only"
  | "core/hero-split"
  | "core/feature-list-alternating"
  | "core/logo-cloud"
  | "core/stats-band"
  | "core/team-grid"
  | "core/comparison-table"
  | "core/process-steps"
  | "core/roadmap-timeline"
  | "core/bento-grid"
  // Wave C — forms / conversions
  | "core/contact-form"
  | "core/newsletter-signup"
  | "core/cta-with-form"
  | "core/booking-cta"
  // Wave D — content discovery
  | "core/latest-posts"
  | "core/featured-products"
  | "core/author-bio"
  | "core/social-links"
  | "core/tag-cloud"
  // Wave E — layout containers
  | "core/accordion"
  | "core/tabs";

export type BlockName = CoreBlockName | (string & {});

export interface ConvexPressBlock<TAttrs extends Record<string, unknown> = Record<string, unknown>> {
  id: string;
  name: BlockName;
  version: number;
  attrs: TAttrs;
  innerBlocks?: ConvexPressBlock[];
}

export interface BlockRendererProps<TAttrs extends Record<string, unknown>> {
  block: ConvexPressBlock<TAttrs>;
  attrs: TAttrs;
  /**
   * Recursively rendered innerBlocks. Container blocks (columns, accordion,
   * tabs, etc.) drop this into their layout. Leaf blocks ignore it.
   *
   * BlockListRenderer always passes a value (either a node or null) so the
   * type is non-undefined when accessed.
   */
  children?: ReactNode;
}

export type BlockRendererStatus = "ready" | "admin-only" | "missing" | "deprecated";

export interface WebsiteBlockDefinition {
  name: BlockName;
  title: string;
  version: number;
  schema: ZodType<any, any, any>;
  Renderer: ComponentType<any>;
  rendererStatus?: BlockRendererStatus;
  replacedBy?: BlockName;
}

export type BlockValidationResult<TAttrs extends Record<string, unknown> = Record<string, unknown>> =
  | {
      ok: true;
      block: ConvexPressBlock<TAttrs>;
    }
  | {
      ok: false;
      block: ConvexPressBlock;
      message: string;
    };
