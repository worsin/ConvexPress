import type { ReactNode } from "react";
import type { Id } from "@convexpress-website/backend/generated/dataModel";
import type { FooterConfig } from "@/lib/layout/types";
import { MediaImage } from "@/components/media/MediaImage";
import { cn } from "@/lib/utils";

/** Section layout controls apply when no authored rows replace the section footer. */
export function footerColumnsClass(columns: FooterConfig["layout"]["columns"]) {
  switch (columns) {
    case "1": return "grid grid-cols-1";
    case "2": return "grid grid-cols-1 md:grid-cols-2";
    case "3": return "grid grid-cols-1 md:grid-cols-3";
    case "centered": return "grid grid-cols-1 justify-items-center text-center";
    case "minimal": return "flex flex-wrap items-start justify-between";
    default: return "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4";
  }
}

export function FooterSectionFrame({ layout, pack, className, children }: {
  layout: FooterConfig["layout"];
  pack?: string;
  className?: string;
  children: ReactNode;
}) {
  const background = layout.background === "dark" ? "bg-muted/30" : layout.background === "accent" ? "bg-accent/10" : "bg-background";
  const border = layout.topBorder === "none" ? "" : layout.topBorder === "bold" ? "border-t-2 border-border" : layout.topBorder === "accent" ? "border-t-2 border-accent" : "border-t border-border";
  return <footer data-slot="site-footer" data-customize="footer.layout.background" data-pack={pack} role="contentinfo" className={cn("relative isolate", background, border, className)}>
    {layout.background === "image" && layout.backgroundImageId ? <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden opacity-20">
      <MediaImage mediaId={layout.backgroundImageId as Id<"media">} alt="" className="size-full object-cover" />
    </div> : null}
    {children}
  </footer>;
}
