/**
 * BlockOutlinePanel — the sidebar tree-view of the current page's blocks.
 *
 * Reads the same `blocks` array the editor is editing and renders one row
 * per top-level block. Clicking a row scrolls the canvas to that block and
 * focuses it for keyboard editing.
 *
 * Pure UI (no Convex calls). The editor (`BlockOutline`) renders rows with
 * `data-block-id` on their wrapper article so this panel can scroll to them.
 */

import { useCallback } from "react";
import {
  AlignLeft,
  BadgeDollarSign,
  Bookmark,
  CalendarClock,
  Code as CodeIcon,
  Columns2,
  FormInput,
  Globe,
  GraduationCap,
  Grid3x3,
  HelpCircle,
  Heading as HeadingIcon,
  Image as ImageIcon,
  Images,
  LayoutGrid,
  Layers,
  List as ListIcon,
  ListOrdered,
  Mail,
  Map as MapIcon,
  MessageCircle,
  Minus,
  MousePointerClick,
  Newspaper,
  Pilcrow,
  Quote as QuoteIcon,
  Rows3,
  SeparatorHorizontal,
  ShoppingBag,
  Sparkles,
  Square,
  Tag as TagIcon,
  Users2,
  Video,
} from "lucide-react";

import type { ConvexPressBlock } from "@/lib/blocks/types";
import { getBlockDefinition } from "@/lib/blocks/registry";
import { cn } from "@/lib/utils";

// Lucide icon picker — keeps the panel decoupled from the registry icon refs
// (those are React components, but using them across module boundaries is fine).
const ICON_BY_NAME: Record<string, React.ElementType> = {
  "core/paragraph": Pilcrow,
  "core/heading": HeadingIcon,
  "core/list": ListIcon,
  "core/image": ImageIcon,
  "core/quote": QuoteIcon,
  "core/code": CodeIcon,
  "core/divider": Minus,
  "core/spacer": SeparatorHorizontal,
  "core/embed": Video,
  "core/hero": Sparkles,
  "core/rich-text": Rows3,
  "core/feature-grid": Rows3,
  "core/cta-band": MousePointerClick,
  "core/media-text": Images,
  "core/testimonials": QuoteIcon,
  "core/pricing-cards": BadgeDollarSign,
  "core/faq": HelpCircle,
  "core/hero-text-only": AlignLeft,
  "core/hero-split": Columns2,
  "core/feature-list-alternating": Layers,
  "core/logo-cloud": Bookmark,
  "core/stats-band": GraduationCap,
  "core/team-grid": Users2,
  "core/comparison-table": LayoutGrid,
  "core/process-steps": ListOrdered,
  "core/roadmap-timeline": MapIcon,
  "core/bento-grid": Grid3x3,
  "core/contact-form": FormInput,
  "core/newsletter-signup": Mail,
  "core/cta-with-form": MousePointerClick,
  "core/booking-cta": CalendarClock,
  "core/latest-posts": Newspaper,
  "core/featured-products": ShoppingBag,
  "core/author-bio": MessageCircle,
  "core/social-links": Globe,
  "core/tag-cloud": TagIcon,
  "core/accordion": ListIcon,
  "core/tabs": Columns2,
};

interface BlockOutlinePanelProps {
  blocks: ConvexPressBlock[];
  activeBlockId?: string | null;
  /** Selector to find the editor's canvas inside the document. */
  canvasSelector?: string;
  onSelect?: (blockId: string) => void;
}

export function BlockOutlinePanel({
  blocks,
  activeBlockId,
  canvasSelector = "[data-slot='block-outline']",
  onSelect,
}: BlockOutlinePanelProps) {
  const scrollTo = useCallback(
    (blockId: string) => {
      const canvas = document.querySelector(canvasSelector);
      const row = canvas?.querySelector(`[data-block-id="${blockId}"]`);
      if (row) {
        row.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      onSelect?.(blockId);
    },
    [canvasSelector, onSelect],
  );

  if (blocks.length === 0) {
    return (
      <aside data-slot="block-outline-panel" className="border border-border bg-card">
        <div className="border-b border-border px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Outline
        </div>
        <p className="p-4 text-xs text-muted-foreground">
          No blocks yet. Add one to see the outline.
        </p>
      </aside>
    );
  }

  return (
    <aside data-slot="block-outline-panel" className="border border-border bg-card">
      <div className="border-b border-border px-3 py-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Outline
        </span>
        <span className="text-xs text-muted-foreground">
          {blocks.length} {blocks.length === 1 ? "block" : "blocks"}
        </span>
      </div>
      <ol className="max-h-[60vh] overflow-y-auto p-1 space-y-0.5">
        {blocks.map((block, idx) => {
          const def = getBlockDefinition(block.name);
          const Icon = ICON_BY_NAME[block.name] ?? Square;
          const preview = previewFor(block);
          return (
            <li key={block.id}>
              <button
                type="button"
                onClick={() => scrollTo(block.id)}
                aria-current={activeBlockId === block.id ? "true" : undefined}
                className={cn(
                  "flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs transition-colors",
                  activeBlockId === block.id
                    ? "bg-primary/10 text-foreground"
                    : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
                )}
              >
                <span className="text-[10px] tabular-nums text-muted-foreground/70 w-5 shrink-0 text-right">
                  {idx + 1}
                </span>
                <Icon className="size-3.5 shrink-0" />
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-medium text-foreground">{def?.title ?? block.name}</span>
                  {preview && <span className="ml-1.5 text-muted-foreground">· {preview}</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}

function previewFor(block: ConvexPressBlock): string {
  const a = block.attrs as Record<string, unknown>;
  const pick = (k: string) =>
    typeof a[k] === "string" && (a[k] as string).trim() ? (a[k] as string).trim() : "";
  const candidate =
    pick("title") || pick("heading") || pick("text") || pick("body") || pick("url");
  return truncate(candidate, 40);
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + "…";
}
