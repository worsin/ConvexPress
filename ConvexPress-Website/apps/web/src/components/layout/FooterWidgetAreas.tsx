import { cn } from "@/lib/utils";

import { WidgetArea } from "./WidgetArea";

interface FooterWidgetAreasProps {
  columns?: 1 | 2 | 3 | 4;
}

const GRID_COLS_MAP: Record<number, string> = {
  1: "lg:grid-cols-1",
  2: "lg:grid-cols-2",
  3: "lg:grid-cols-3",
  4: "lg:grid-cols-4",
};

/**
 * Renders the footer widget area columns.
 * Each column corresponds to a widget area slug (footer-1, footer-2, etc.).
 */
export function FooterWidgetAreas({ columns = 3 }: FooterWidgetAreasProps) {
  const slugs = Array.from(
    { length: columns },
    (_, i) => `footer-${i + 1}`,
  );

  return (
    <div
      data-slot="footer-widget-areas"
      className={cn(
        "grid grid-cols-1 gap-8 md:grid-cols-2",
        GRID_COLS_MAP[columns],
      )}
    >
      {slugs.map((slug) => (
        <WidgetArea key={slug} slug={slug} />
      ))}
    </div>
  );
}
