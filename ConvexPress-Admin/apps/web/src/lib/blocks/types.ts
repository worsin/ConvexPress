import type { ComponentType } from "react";
import type { LucideIcon } from "lucide-react";
import type { ZodType } from "zod";

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

export type BlockCategory =
  | "text"
  | "layout"
  | "marketing"
  | "media"
  | "forms"
  | "commerce"
  | "site"
  | "custom";

/**
 * AI guidance for a block. Surfaced in the LLM system prompt when the AI
 * picks which block to use and how to fill its attrs.
 */
export interface BlockAiHints {
  /** When the AI should reach for this block. */
  useFor?: string;
  /** When the AI should avoid this block. */
  avoid?: string;
  /** Example attrs — shown to the AI as few-shot. */
  examples?: Array<Record<string, unknown>>;
}

export interface ConvexPressBlock<TAttrs extends Record<string, unknown> = Record<string, unknown>> {
  id: string;
  name: BlockName;
  version: number;
  attrs: TAttrs;
  innerBlocks?: ConvexPressBlock[];
}

export interface BlockSupports {
  reusable?: boolean;
  multiple?: boolean;
  innerBlocks?: boolean;
  allowedChildren?: BlockName[];
  parent?: BlockName[];
  media?: boolean;
}

export type BlockRendererStatus = "ready" | "admin-only" | "missing" | "deprecated";

export interface BlockEditorProps<TAttrs extends Record<string, unknown>> {
  block: ConvexPressBlock<TAttrs>;
  attrs: TAttrs;
  onChange: (attrs: TAttrs) => void;
  disabled?: boolean;
}

export interface AdminBlockDefinition<TAttrs extends Record<string, unknown>> {
  name: BlockName;
  title: string;
  description: string;
  category: BlockCategory;
  keywords?: string[];
  icon: LucideIcon;
  version: number;
  supports: BlockSupports;
  defaultAttrs: TAttrs;
  schema: ZodType<any, any, any>;
  Editor: ComponentType<any>;
  /** Optional AI guidance for this block. */
  aiHints?: BlockAiHints;
  /** Public Website rendering status, surfaced in block diagnostics. */
  rendererStatus?: BlockRendererStatus;
  /** Optional replacement for deprecated blocks. */
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

export type BlockSaveStatus = "saved" | "dirty" | "saving" | "failed" | "conflict";

export type BlockSource = "core" | "official" | "local" | "extension";

export interface BlockSettingsValues {
  disabledBlockNames: string[];
}
