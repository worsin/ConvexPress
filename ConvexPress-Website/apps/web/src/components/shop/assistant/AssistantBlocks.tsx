/**
 * Renders the typed blocks an assistant turn is made of. Product ids resolve
 * to live cards (price, stock, in-cart state) through the shared card map.
 */

import { Link } from "@tanstack/react-router";
import { Check, Lightbulb, Info, TriangleAlert, ArrowRight } from "lucide-react";
import type { ReactNode } from "react";

import { ProductMiniCard, type ProductCardData } from "@/components/shop/ProductMiniCard";
import { cn } from "@/lib/utils";
import type { AssistantBlock } from "./useAssistant";

function inline(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, index) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={index} className="font-semibold text-foreground">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <span key={index}>{part}</span>
    ),
  );
}

/** Tiny markdown: paragraphs, bullet lists, bold. Enough for assistant prose. */
export function MarkdownLite({ text, className }: { text: string; className?: string }) {
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  return (
    <div className={cn("space-y-2 text-sm leading-6 text-foreground/90", className)}>
      {paragraphs.map((paragraph, index) => {
        const lines = paragraph.split("\n");
        const isList = lines.every((line) => /^\s*[-•*]\s+/.test(line));
        if (isList) {
          return (
            <ul key={index} className="list-disc space-y-1 pl-5">
              {lines.map((line, lineIndex) => (
                <li key={lineIndex}>{inline(line.replace(/^\s*[-•*]\s+/, ""))}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={index}>
            {lines.map((line, lineIndex) => (
              <span key={lineIndex}>
                {inline(line)}
                {lineIndex < lines.length - 1 ? <br /> : null}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}

export function AssistantBlocks({
  blocks,
  cardById,
  onAsk,
  onNavigate,
  onTrack,
  compact = false,
}: {
  blocks: AssistantBlock[];
  cardById: Map<string, ProductCardData>;
  onAsk: (prompt: string) => void;
  onNavigate?: () => void;
  onTrack?: (event: "click" | "add", productIds: string[], groupKey?: string) => void;
  compact?: boolean;
}) {
  return (
    <div className="space-y-3">
      {blocks.map((block, index) => {
        switch (block.type) {
          case "text":
            return <MarkdownLite key={index} text={block.markdown} />;
          case "callout": {
            const Icon = block.tone === "warning" ? TriangleAlert : block.tone === "note" ? Info : Lightbulb;
            return (
              <div
                key={index}
                className={cn(
                  "flex gap-2.5 rounded-lg border px-3 py-2.5 text-sm",
                  block.tone === "warning"
                    ? "border-destructive/30 bg-destructive/5 text-foreground"
                    : "border-primary/25 bg-primary/5 text-foreground",
                )}
              >
                <Icon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                <MarkdownLite text={block.markdown} className="space-y-1 text-[13px] leading-5" />
              </div>
            );
          }
          case "action_result":
            return (
              <div key={index} className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-xs font-medium text-foreground">
                <Check className="size-3.5 text-primary" aria-hidden="true" />
                {block.summary}
              </div>
            );
          case "product_group": {
            const items = block.items.filter((item) => cardById.has(item.productId));
            if (!items.length) return null;
            return (
              <section key={index} className="space-y-2">
                <div className="flex items-baseline justify-between gap-2">
                  <h4 className="text-[13px] font-semibold text-foreground">{block.title}</h4>
                  {block.seeMoreQuery && (
                    <Link
                      to="/products"
                      search={{ q: block.seeMoreQuery } as any}
                      onClick={onNavigate}
                      className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                    >
                      See more <ArrowRight className="size-3" aria-hidden="true" />
                    </Link>
                  )}
                </div>
                {block.reason && <p className="text-xs text-muted-foreground">{block.reason}</p>}
                <div className={cn("grid gap-2", compact ? "grid-cols-1" : "grid-cols-1")}>
                  {items.map((item) => (
                    <ProductMiniCard
                      key={item.productId}
                      product={cardById.get(item.productId)!}
                      rationale={item.rationale}
                      onNavigate={() => {
                        onTrack?.("click", [item.productId], block.title);
                        onNavigate?.();
                      }}
                      onAdded={() => onTrack?.("add", [item.productId], block.title)}
                    />
                  ))}
                </div>
              </section>
            );
          }
          case "compare_table": {
            const rows = block.rows.filter((row) => cardById.has(row.productId));
            if (!rows.length) return null;
            // Stacked spec cards: readable in a 320px rail, no horizontal scroll.
            return (
              <div key={index} className="grid gap-2">
                {rows.map((row) => {
                  const card = cardById.get(row.productId)!;
                  return (
                    <div key={row.productId} className="rounded-lg border border-border bg-background p-2.5">
                      <Link to="/products/$slug" params={{ slug: card.slug }} onClick={onNavigate} className="text-[13px] font-semibold text-foreground hover:text-primary">
                        {card.title}
                      </Link>
                      <dl className="mt-1.5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-xs">
                        {block.columns.map((column, columnIndex) => (
                          <div key={column} className="contents">
                            <dt className="text-muted-foreground">{column}</dt>
                            <dd className="text-foreground">{row.values[columnIndex] ?? "—"}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  );
                })}
              </div>
            );
          }
          case "chips":
            return (
              <div key={index} className="flex flex-wrap gap-1.5">
                {block.items.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => onAsk(chip)}
                    className="rounded-full border border-border bg-background px-3 py-1.5 text-left text-xs text-foreground transition-colors hover:border-primary/50 hover:bg-primary/5"
                  >
                    {chip}
                  </button>
                ))}
              </div>
            );
          case "facets":
            return (
              <div key={index} className="flex flex-wrap gap-1.5">
                <span className="self-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Narrow</span>
                {block.items.map((facet) => (
                  <Link
                    key={facet.label}
                    to="/products"
                    search={{ q: facet.query, category: facet.categorySlug } as any}
                    onClick={onNavigate}
                    className="rounded-full bg-muted px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                  >
                    {facet.label}
                  </Link>
                ))}
              </div>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}
