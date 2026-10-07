import type { ReactNode } from "react";
import type { FooterRow } from "@/lib/layout/types";
import { cn } from "@/lib/utils";

const ROW_BG: Record<FooterRow["background"], string> = {
  default: "bg-background",
  muted: "bg-muted/40",
  accent: "bg-accent/10",
  contrast: "bg-foreground text-background",
  transparent: "",
};
const ROW_PAD: Record<FooterRow["padding"], string> = {
  none: "py-0",
  compact: "py-3 lg:py-4",
  normal: "py-6 lg:py-8",
  spacious: "py-10 lg:py-14",
};
const ROW_CONTAINER: Record<FooterRow["container"], string> = {
  narrow: "max-w-3xl",
  default: "max-w-5xl",
  wide: "max-w-7xl",
  full: "max-w-none",
};
const ROW_BORDER: Record<NonNullable<FooterRow["topBorder"]>, string> = {
  none: "",
  subtle: "border-t border-border",
  bold: "border-t-2 border-border",
  accent: "border-t-2 border-accent",
};
/** Shared authored row geometry; packs keep their own cell typography and content. */
export function FooterRowFrame({ row, children }: { row: FooterRow; children: ReactNode }) {
  return <div data-footer-row={row.id} className={cn(ROW_BG[row.background], row.topBorder && ROW_BORDER[row.topBorder])}>
    <div className={cn("mx-auto w-full px-4 md:px-6 lg:px-8", ROW_CONTAINER[row.container], ROW_PAD[row.padding])}>
      {children}
    </div>
  </div>;
}
