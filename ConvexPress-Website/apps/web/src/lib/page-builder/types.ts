export interface PageSectionShell {
  tone?: "default" | "muted" | "accent" | "contrast";
  padding?: "normal" | "spacious";
  container?: "content" | "wide";
}

export interface PageSection {
  id: string;
  type:
    | "hero"
    | "feature-grid"
    | "story-split"
    | "pricing-cards"
    | "testimonial-band"
    | "cta-band"
    | "rich-text";
  variant?: string;
  shell?: PageSectionShell;
  data?: Record<string, unknown>;
}
