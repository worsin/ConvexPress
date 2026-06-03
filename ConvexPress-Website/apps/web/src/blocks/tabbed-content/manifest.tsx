import { useState } from "react";
import type { BlockRendererProps, WebsiteBlockDefinition } from "@/lib/blocks/types";
import { BlockMedia, CtaLink, RichText, SectionIntro } from "../_shared/rendering";
import { tabbedContentAttrsSchema, type TabbedContentAttrs } from "./schema";

function TabbedContentRenderer({ attrs }: BlockRendererProps<TabbedContentAttrs>) {
  const [activeIndex, setActiveIndex] = useState(0);
  const activeTab = attrs.tabs[activeIndex] ?? attrs.tabs[0];

  return (
    <div className="space-y-6">
      <SectionIntro heading={attrs.heading} body={attrs.intro} />
      {attrs.tabs.length > 0 && (
        <div
          className={
            attrs.orientation === "left"
              ? "grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]"
              : "grid gap-4"
          }
        >
          <div
            role="tablist"
            aria-orientation={attrs.orientation === "left" ? "vertical" : "horizontal"}
            className={
              attrs.orientation === "left"
                ? "grid content-start gap-2"
                : "flex flex-wrap gap-2"
            }
          >
            {attrs.tabs.map((tab, index) => (
              <button
                key={index}
                type="button"
                role="tab"
                aria-selected={index === activeIndex}
                onClick={() => setActiveIndex(index)}
                className="min-h-10 border border-border px-3 text-left text-sm font-semibold text-muted-foreground hover:bg-muted aria-selected:border-primary aria-selected:bg-primary aria-selected:text-primary-foreground"
              >
                {tab.label || `Tab ${index + 1}`}
              </button>
            ))}
          </div>
          {activeTab && (
            <article role="tabpanel" className="grid gap-5 border border-border bg-card p-5 md:grid-cols-[minmax(0,1fr)_220px]">
              <div className="space-y-3">
                {activeTab.title && (
                  <h3 className="text-xl font-semibold text-foreground">
                    {activeTab.title}
                  </h3>
                )}
                <RichText text={activeTab.body} />
                <CtaLink label={activeTab.ctaLabel} href={activeTab.ctaUrl} />
              </div>
              {activeTab.mediaId && (
                <BlockMedia
                  mediaId={activeTab.mediaId}
                  alt={activeTab.mediaAlt || activeTab.title || activeTab.label}
                  className="aspect-square w-full object-cover"
                  sizes="(max-width: 768px) 100vw, 220px"
                />
              )}
            </article>
          )}
        </div>
      )}
    </div>
  );
}

export const definition = {
  name: "blocks/tabbed-content",
  title: "Tabbed Content",
  version: 1,
  schema: tabbedContentAttrsSchema,
  Renderer: TabbedContentRenderer,
  rendererStatus: "ready",
} satisfies WebsiteBlockDefinition;

export default definition;
