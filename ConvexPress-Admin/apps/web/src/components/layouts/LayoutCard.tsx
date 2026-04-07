import { cn } from "@/lib/utils";
import type { Layout } from "./types";

interface LayoutCardProps {
  layout: Layout;
  onClick: () => void;
}

const TYPE_BADGE_STYLES: Record<Layout["type"], string> = {
  preset: "bg-primary/15 text-primary",
  custom: "bg-emerald-500/15 text-emerald-400",
  ai: "bg-amber-500/15 text-amber-400",
};

const TYPE_LABELS: Record<Layout["type"], string> = {
  preset: "Preset",
  custom: "Custom",
  ai: "AI Generated",
};

function MiniPreview({ layout }: { layout: Layout }) {
  const { config } = layout;
  const heroSection = config.sections.find((s) => s.type === "hero");
  const sidebarSection = config.sections.find((s) => s.type === "sidebar");
  const topicsSection = config.sections.find((s) => s.type === "topics");
  const relatedSection = config.sections.find((s) => s.type === "related");

  const hasSidebar = sidebarSection?.enabled;
  const sidebarLeft = sidebarSection?.variant === "left";

  return (
    <div className="flex flex-col gap-1 p-3 h-28">
      {/* Hero block */}
      {heroSection?.enabled && (
        <div
          className={cn(
            "rounded-sm bg-primary/20",
            heroSection.options?.height === "tall" ? "h-6" : "h-4"
          )}
        />
      )}

      {/* Content area with optional sidebar */}
      <div className="flex gap-1 flex-1 min-h-0">
        {hasSidebar && sidebarLeft && (
          <div className="w-1/4 rounded-sm bg-muted-foreground/15" />
        )}
        <div className="flex-1 flex flex-col gap-1">
          {/* Topics approximation */}
          {topicsSection?.enabled && (
            <div className="flex gap-1 flex-1">
              {(topicsSection.variant === "grid" ||
                topicsSection.variant === "cards" ||
                topicsSection.variant === "masonry") &&
              Number(topicsSection.options?.columns ?? 2) >= 2 ? (
                <>
                  <div className="flex-1 rounded-sm bg-muted-foreground/10" />
                  <div className="flex-1 rounded-sm bg-muted-foreground/10" />
                </>
              ) : (
                <div className="flex-1 rounded-sm bg-muted-foreground/10" />
              )}
            </div>
          )}
        </div>
        {hasSidebar && !sidebarLeft && (
          <div className="w-1/4 rounded-sm bg-muted-foreground/15" />
        )}
      </div>

      {/* Related block */}
      {relatedSection?.enabled && (
        <div className="flex gap-1">
          <div className="flex-1 h-2 rounded-sm bg-muted-foreground/10" />
          <div className="flex-1 h-2 rounded-sm bg-muted-foreground/10" />
          <div className="flex-1 h-2 rounded-sm bg-muted-foreground/10" />
        </div>
      )}
    </div>
  );
}

export function LayoutCard({ layout, onClick }: LayoutCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-col rounded-xl border border-border bg-card overflow-hidden text-left transition-all hover:border-primary/50 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
    >
      {/* Mini preview area */}
      <div className="border-b border-border/50 bg-muted/30">
        <MiniPreview layout={layout} />
      </div>

      {/* Info area */}
      <div className="flex flex-col gap-1.5 p-3 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-medium text-foreground group-hover:text-primary transition-colors truncate">
            {layout.name}
          </h3>
          <span
            className={cn(
              "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
              TYPE_BADGE_STYLES[layout.type]
            )}
          >
            {TYPE_LABELS[layout.type]}
          </span>
        </div>
        {layout.description && (
          <p className="text-xs text-muted-foreground line-clamp-2">
            {layout.description}
          </p>
        )}
      </div>
    </button>
  );
}
