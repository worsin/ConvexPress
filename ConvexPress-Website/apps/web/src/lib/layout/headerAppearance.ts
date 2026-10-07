import type { HeaderConfig } from "./types";

export function headerAppearance(layout: HeaderConfig["layout"]) {
  return {
    background: layout.background === "transparent" ? "bg-transparent" : layout.background === "glass" ? "bg-background/85 backdrop-blur-md" : "bg-background",
    border: layout.bottomBorder === "bold" ? "border-b-2 border-border" : layout.bottomBorder === "shadow" ? "shadow-sm" : layout.bottomBorder === "none" ? "" : "border-b border-border",
  };
}

/** Keep each pack's normal rhythm while allowing compact/tall author choices. */
export function headerHeight(height: HeaderConfig["layout"]["height"], pack: "journal" | "aster-house" | "depot") {
  const classes = {
    journal: { compact: "min-h-12", normal: "min-h-16", tall: "min-h-20" },
    "aster-house": { compact: "min-h-16", normal: "min-h-24", tall: "min-h-28" },
    depot: { compact: "min-h-12", normal: "min-h-14", tall: "min-h-18" },
  };
  return classes[pack][height];
}
