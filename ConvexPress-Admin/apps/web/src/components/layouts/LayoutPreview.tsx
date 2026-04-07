import { Monitor, Tablet, Smartphone } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LayoutConfig, SectionConfig } from "./types";

type DeviceWidth = "desktop" | "tablet" | "mobile";

interface LayoutPreviewProps {
  config: LayoutConfig;
  deviceWidth?: DeviceWidth;
  onDeviceChange?: (device: DeviceWidth) => void;
}

const DEVICE_OPTIONS: { id: DeviceWidth; label: string; icon: typeof Monitor }[] = [
  { id: "desktop", label: "Desktop", icon: Monitor },
  { id: "tablet", label: "Tablet", icon: Tablet },
  { id: "mobile", label: "Mobile", icon: Smartphone },
];

const DEVICE_MAX_WIDTH: Record<DeviceWidth, string> = {
  desktop: "max-w-full",
  tablet: "max-w-md",
  mobile: "max-w-xs",
};

const CONTENT_WIDTH_CLASS: Record<string, string> = {
  narrow: "max-w-lg",
  medium: "max-w-2xl",
  wide: "max-w-4xl",
  full: "max-w-full",
};

function getSectionConfig(config: LayoutConfig, type: string): SectionConfig | undefined {
  return config.sections.find((s) => s.type === type);
}

// ---- Individual section preview renderers ----

function HeroPreview({ section }: { section: SectionConfig }) {
  const variant = section.variant || "full-banner";
  const height = section.options?.height as string || "medium";
  const showCTA = section.options?.showCTA !== false;

  const heightClass = {
    short: "py-6",
    medium: "py-10",
    tall: "py-16",
    "full-screen": "py-24",
  }[height] || "py-10";

  if (variant === "split") {
    return (
      <div className={cn("flex gap-4 bg-primary/10 rounded-lg px-6", heightClass)}>
        <div className="flex-1 flex flex-col justify-center gap-2">
          <div className="h-3 w-3/4 rounded bg-foreground/20" />
          <div className="h-2 w-1/2 rounded bg-foreground/10" />
          {showCTA && (
            <div className="h-6 w-20 rounded-full bg-primary/40 mt-2" />
          )}
        </div>
        <div className="flex-1 rounded-lg bg-muted-foreground/10" />
      </div>
    );
  }

  if (variant === "minimal") {
    return (
      <div className={cn("px-6 flex flex-col justify-center gap-2", "py-4")}>
        <div className="h-4 w-2/3 rounded bg-foreground/20" />
        <div className="h-2 w-1/3 rounded bg-foreground/10" />
      </div>
    );
  }

  if (variant === "video-bg") {
    return (
      <div
        className={cn(
          "relative rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 px-6 flex flex-col items-center justify-center gap-2 text-center",
          heightClass
        )}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="size-8 rounded-full border-2 border-foreground/10 flex items-center justify-center">
            <div className="ml-0.5 border-l-[6px] border-y-[4px] border-y-transparent border-l-foreground/20" />
          </div>
        </div>
        <div className="relative z-10 h-3 w-1/2 rounded bg-foreground/20" />
        <div className="relative z-10 h-2 w-1/3 rounded bg-foreground/10" />
        {showCTA && (
          <div className="relative z-10 h-6 w-24 rounded-full bg-primary/40 mt-1" />
        )}
      </div>
    );
  }

  // full-banner (default)
  return (
    <div
      className={cn(
        "rounded-lg bg-gradient-to-r from-primary/15 to-primary/5 px-6 flex flex-col items-center justify-center gap-2 text-center",
        heightClass
      )}
    >
      <div className="h-4 w-1/2 rounded bg-foreground/20" />
      <div className="h-2 w-1/3 rounded bg-foreground/10" />
      {showCTA && (
        <div className="h-7 w-28 rounded-full bg-primary/40 mt-2" />
      )}
    </div>
  );
}

function BreadcrumbsPreview() {
  return (
    <div className="flex items-center gap-1.5 py-2 px-1">
      <div className="h-2 w-8 rounded bg-primary/30" />
      <span className="text-[8px] text-muted-foreground">/</span>
      <div className="h-2 w-12 rounded bg-primary/20" />
      <span className="text-[8px] text-muted-foreground">/</span>
      <div className="h-2 w-16 rounded bg-foreground/15" />
    </div>
  );
}

function TocPreview({ section }: { section: SectionConfig }) {
  const variant = section.variant || "sidebar";
  if (variant === "floating") {
    return (
      <div className="absolute right-2 top-2 z-10 w-28 rounded-lg border border-border/50 bg-card p-2 space-y-1.5 shadow-sm">
        <div className="h-2 w-16 rounded bg-foreground/15" />
        <div className="h-1.5 w-20 rounded bg-foreground/10 ml-2" />
        <div className="h-1.5 w-14 rounded bg-foreground/10 ml-2" />
        <div className="h-1.5 w-18 rounded bg-foreground/10 ml-2" />
      </div>
    );
  }

  // sidebar and inline variants share similar visual
  return (
    <div className="rounded-lg border border-border/50 bg-card/50 p-3 space-y-1.5">
      <div className="h-2 w-20 rounded bg-foreground/15 mb-2" />
      <div className="h-1.5 w-full rounded bg-foreground/10" />
      <div className="h-1.5 w-3/4 rounded bg-foreground/10 ml-3" />
      <div className="h-1.5 w-5/6 rounded bg-foreground/10 ml-3" />
      <div className="h-1.5 w-full rounded bg-foreground/10" />
      <div className="h-1.5 w-2/3 rounded bg-foreground/10 ml-3" />
    </div>
  );
}

function TopicsPreview({ section }: { section: SectionConfig }) {
  const variant = section.variant || "grid";
  const columns = Number(section.options?.columns ?? 2);
  const showImages = section.options?.showImages !== false;

  if (variant === "stacked") {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-lg border border-border/30 p-3">
            <div className="h-2.5 w-3/4 rounded bg-foreground/15 mb-1.5" />
            <div className="h-1.5 w-full rounded bg-foreground/8" />
            <div className="h-1.5 w-5/6 rounded bg-foreground/8 mt-1" />
          </div>
        ))}
      </div>
    );
  }

  if (variant === "accordion") {
    return (
      <div className="space-y-1">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-lg border border-border/30 px-3 py-2">
            <div className="flex items-center justify-between">
              <div className="h-2 w-1/2 rounded bg-foreground/15" />
              <div className="h-2 w-2 rounded bg-foreground/10" />
            </div>
            {i === 1 && (
              <div className="mt-2 space-y-1">
                <div className="h-1.5 w-full rounded bg-foreground/8" />
                <div className="h-1.5 w-4/5 rounded bg-foreground/8" />
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }

  if (variant === "cards") {
    const colClass = columns >= 3 ? "grid-cols-3" : columns === 2 ? "grid-cols-2" : "grid-cols-1";
    return (
      <div className={cn("grid gap-2", colClass)}>
        {Array.from({ length: Math.min(columns * 2, 6) }).map((_, i) => (
          <div
            key={i}
            className="rounded-lg border border-border/30 bg-card/50 overflow-hidden shadow-sm"
          >
            {showImages && <div className="h-10 bg-muted-foreground/10" />}
            <div className="p-2 space-y-1">
              <div className="h-2 w-3/4 rounded bg-foreground/15" />
              <div className="h-1.5 w-full rounded bg-foreground/8" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (variant === "zigzag") {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={cn("flex gap-3", i % 2 === 1 && "flex-row-reverse")}
          >
            {showImages && (
              <div className="w-2/5 rounded-lg bg-muted-foreground/10 min-h-[40px]" />
            )}
            <div className="flex-1 space-y-1 py-1">
              <div className="h-2.5 w-3/4 rounded bg-foreground/15" />
              <div className="h-1.5 w-full rounded bg-foreground/8" />
              <div className="h-1.5 w-5/6 rounded bg-foreground/8" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (variant === "timeline") {
    return (
      <div className="relative pl-6 space-y-3">
        <div className="absolute left-2 top-0 bottom-0 w-px bg-border" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="relative">
            <div className="absolute -left-[18px] top-1 size-2 rounded-full bg-primary/50" />
            <div className="rounded-lg border border-border/30 p-2">
              <div className="h-2 w-1/2 rounded bg-foreground/15 mb-1" />
              <div className="h-1.5 w-full rounded bg-foreground/8" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (variant === "tabbed") {
    return (
      <div>
        <div className="flex gap-1 border-b border-border/30 mb-2">
          {["Tab 1", "Tab 2", "Tab 3"].map((tab, i) => (
            <div
              key={tab}
              className={cn(
                "px-3 py-1.5 text-[8px] rounded-t",
                i === 0
                  ? "bg-primary/15 text-foreground/60 border-b-2 border-primary/40"
                  : "text-muted-foreground/50"
              )}
            >
              {tab}
            </div>
          ))}
        </div>
        <div className="space-y-1 p-2">
          <div className="h-2.5 w-2/3 rounded bg-foreground/15" />
          <div className="h-1.5 w-full rounded bg-foreground/8" />
          <div className="h-1.5 w-4/5 rounded bg-foreground/8" />
        </div>
      </div>
    );
  }

  // Default: grid (also masonry, alternating, featured-first)
  const colClass = columns >= 3 ? "grid-cols-3" : columns === 2 ? "grid-cols-2" : "grid-cols-1";
  return (
    <div className={cn("grid gap-2", colClass)}>
      {Array.from({ length: Math.min(columns * 2, 6) }).map((_, i) => (
        <div key={i} className="rounded-lg border border-border/30 overflow-hidden">
          {showImages && <div className="h-10 bg-muted-foreground/10" />}
          <div className="p-2 space-y-1">
            <div className="h-2 w-3/4 rounded bg-foreground/15" />
            <div className="h-1.5 w-full rounded bg-foreground/8" />
          </div>
        </div>
      ))}
    </div>
  );
}

function SummaryPreview({ section }: { section: SectionConfig }) {
  const variant = section.variant || "callout";

  if (variant === "banner") {
    return (
      <div className="rounded-lg bg-primary/10 px-4 py-3 space-y-1">
        <div className="h-2.5 w-1/4 rounded bg-primary/30" />
        <div className="h-1.5 w-full rounded bg-primary/15" />
        <div className="h-1.5 w-3/4 rounded bg-primary/15" />
      </div>
    );
  }

  if (variant === "inline") {
    return (
      <div className="space-y-1 py-2">
        <div className="h-2 w-24 rounded bg-foreground/15" />
        <div className="h-1.5 w-full rounded bg-foreground/8" />
        <div className="h-1.5 w-5/6 rounded bg-foreground/8" />
      </div>
    );
  }

  // callout
  return (
    <div className="rounded-lg border-l-4 border-l-emerald-500/40 bg-emerald-500/5 px-4 py-3 space-y-1">
      <div className="h-2.5 w-1/4 rounded bg-emerald-500/25" />
      <div className="h-1.5 w-full rounded bg-emerald-500/10" />
      <div className="h-1.5 w-3/4 rounded bg-emerald-500/10" />
    </div>
  );
}

function SourcesPreview({ section }: { section: SectionConfig }) {
  const variant = section.variant || "list";

  if (variant === "expandable") {
    return (
      <div className="rounded-lg border border-border/30 p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="h-2 w-16 rounded bg-foreground/15" />
          <div className="h-2 w-2 rounded bg-foreground/10" />
        </div>
        <div className="space-y-1">
          <div className="h-1.5 w-full rounded bg-primary/15" />
          <div className="h-1.5 w-4/5 rounded bg-primary/15" />
        </div>
      </div>
    );
  }

  if (variant === "footnotes") {
    return (
      <div className="border-t border-border/30 pt-2 space-y-1">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex gap-2 items-start">
            <span className="text-[7px] text-muted-foreground shrink-0">[{i}]</span>
            <div className="h-1.5 flex-1 rounded bg-primary/15" />
          </div>
        ))}
      </div>
    );
  }

  // list
  return (
    <div className="space-y-1.5">
      <div className="h-2 w-16 rounded bg-foreground/15" />
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-1.5">
          <div className="size-1 rounded-full bg-primary/30 shrink-0" />
          <div className="h-1.5 flex-1 rounded bg-primary/15" />
        </div>
      ))}
    </div>
  );
}

function SidebarPreview() {
  return (
    <div className="rounded-lg border border-border/30 bg-card/30 p-2 space-y-2 h-full">
      <div className="h-2 w-16 rounded bg-foreground/15" />
      <div className="space-y-1">
        <div className="h-1.5 w-full rounded bg-foreground/8" />
        <div className="h-1.5 w-3/4 rounded bg-foreground/8" />
        <div className="h-1.5 w-5/6 rounded bg-foreground/8" />
      </div>
      <div className="h-px bg-border/30" />
      <div className="h-2 w-12 rounded bg-foreground/15" />
      <div className="space-y-1">
        <div className="h-1.5 w-full rounded bg-foreground/8" />
        <div className="h-1.5 w-2/3 rounded bg-foreground/8" />
      </div>
    </div>
  );
}

function RelatedPreview({ section }: { section: SectionConfig }) {
  const variant = section.variant || "grid";
  const count = Number(section.options?.count ?? 3);

  if (variant === "list") {
    return (
      <div className="space-y-1.5">
        <div className="h-2 w-24 rounded bg-foreground/15 mb-2" />
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="flex items-center gap-2 py-1">
            <div className="size-6 rounded bg-muted-foreground/10 shrink-0" />
            <div className="flex-1 space-y-0.5">
              <div className="h-1.5 w-3/4 rounded bg-foreground/12" />
              <div className="h-1 w-1/2 rounded bg-foreground/6" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (variant === "carousel") {
    return (
      <div className="space-y-2">
        <div className="h-2 w-24 rounded bg-foreground/15" />
        <div className="flex gap-2 overflow-hidden">
          {Array.from({ length: count }).map((_, i) => (
            <div
              key={i}
              className="shrink-0 w-1/3 rounded-lg border border-border/30 overflow-hidden"
            >
              <div className="h-8 bg-muted-foreground/10" />
              <div className="p-1.5">
                <div className="h-1.5 w-3/4 rounded bg-foreground/12" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // grid
  const gridClass = count >= 4 ? "grid-cols-4" : count === 3 ? "grid-cols-3" : "grid-cols-2";
  return (
    <div className="space-y-2">
      <div className="h-2 w-24 rounded bg-foreground/15" />
      <div className={cn("grid gap-2", gridClass)}>
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="rounded-lg border border-border/30 overflow-hidden">
            <div className="h-8 bg-muted-foreground/10" />
            <div className="p-1.5">
              <div className="h-1.5 w-3/4 rounded bg-foreground/12" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function LayoutPreview({ config, deviceWidth = "desktop", onDeviceChange }: LayoutPreviewProps) {
  const heroSection = getSectionConfig(config, "hero");
  const breadcrumbsSection = getSectionConfig(config, "breadcrumbs");
  const tocSection = getSectionConfig(config, "toc");
  const topicsSection = getSectionConfig(config, "topics");
  const summarySection = getSectionConfig(config, "summary");
  const sourcesSection = getSectionConfig(config, "sources");
  const sidebarSection = getSectionConfig(config, "sidebar");
  const relatedSection = getSectionConfig(config, "related");

  const hasSidebar = sidebarSection?.enabled;
  const sidebarLeft = sidebarSection?.variant === "left";
  const hasTocSidebar = tocSection?.enabled && tocSection.variant === "sidebar";
  const hasTocFloating = tocSection?.enabled && tocSection.variant === "floating";
  const hasTocInline = tocSection?.enabled && tocSection.variant === "inline";

  return (
    <div className="flex flex-col h-full">
      {/* Device toolbar */}
      {onDeviceChange && (
        <div className="flex items-center gap-1 p-2 border-b border-border/50">
          {DEVICE_OPTIONS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => onDeviceChange(id)}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs transition-colors",
                deviceWidth === id
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
            >
              <Icon className="size-3.5" />
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Preview area */}
      <div className="flex-1 overflow-y-auto p-4 bg-muted/20">
        <div
          className={cn(
            "mx-auto transition-all rounded-xl border border-border/50 bg-card overflow-hidden",
            DEVICE_MAX_WIDTH[deviceWidth]
          )}
        >
          <div className={cn("mx-auto px-4 py-3 space-y-4", CONTENT_WIDTH_CLASS[config.contentWidth])}>
            {/* Hero */}
            {heroSection?.enabled && <HeroPreview section={heroSection} />}

            {/* Breadcrumbs */}
            {breadcrumbsSection?.enabled && <BreadcrumbsPreview />}

            {/* Inline ToC */}
            {hasTocInline && tocSection && <TocPreview section={tocSection} />}

            {/* Main content area: sidebar + topics */}
            <div className="relative">
              {/* Floating ToC */}
              {hasTocFloating && tocSection && <TocPreview section={tocSection} />}

              <div className={cn("flex gap-4", hasSidebar ? "" : "")}>
                {/* Left sidebar */}
                {hasSidebar && sidebarLeft && (
                  <div className={cn(
                    "shrink-0",
                    sidebarSection.options?.width === "wide" ? "w-1/3" : sidebarSection.options?.width === "narrow" ? "w-1/5" : "w-1/4"
                  )}>
                    {hasTocSidebar && tocSection ? (
                      <div className="space-y-3">
                        <TocPreview section={tocSection} />
                        <SidebarPreview />
                      </div>
                    ) : (
                      <SidebarPreview />
                    )}
                  </div>
                )}

                {/* Content column */}
                <div className="flex-1 min-w-0 space-y-4">
                  {topicsSection?.enabled && <TopicsPreview section={topicsSection} />}
                  {summarySection?.enabled && <SummaryPreview section={summarySection} />}
                  {sourcesSection?.enabled && <SourcesPreview section={sourcesSection} />}
                </div>

                {/* Right sidebar */}
                {hasSidebar && !sidebarLeft && (
                  <div className={cn(
                    "shrink-0",
                    sidebarSection.options?.width === "wide" ? "w-1/3" : sidebarSection.options?.width === "narrow" ? "w-1/5" : "w-1/4"
                  )}>
                    {hasTocSidebar && tocSection ? (
                      <div className="space-y-3">
                        <TocPreview section={tocSection} />
                        <SidebarPreview />
                      </div>
                    ) : (
                      <SidebarPreview />
                    )}
                  </div>
                )}

                {/* ToC sidebar without main sidebar */}
                {!hasSidebar && hasTocSidebar && tocSection && (
                  <div className="w-1/4 shrink-0">
                    <TocPreview section={tocSection} />
                  </div>
                )}
              </div>
            </div>

            {/* Related */}
            {relatedSection?.enabled && <RelatedPreview section={relatedSection} />}
          </div>
        </div>
      </div>
    </div>
  );
}
