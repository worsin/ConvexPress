/**
 * @deprecated 2026-05-11 — Legacy in-admin Theme/Template Builder.
 *
 * STATUS:  Frozen. Hidden from active nav. Do NOT extend or fix issues here.
 * REASON:  A pre-built section enum + preset theme picker limits what each
 *          site can look like. Replaced by AI-generated React components,
 *          one per route, generated per site by the design:* skill kit.
 * REPLACEMENT:  See ConvexPress-Website/design-kit/README.md
 * REMOVAL:  Safe to delete once at least one site is fully shipped via the
 *           skill kit and nothing else references this file.
 */
export interface Theme {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  type: "preset" | "custom";
  headerConfig?: Record<string, unknown>;
  footerConfig?: Record<string, unknown>;
  layoutAssignments?: Record<string, unknown>;
  colorPalette?: Record<string, unknown>;
  thumbnail?: string;
  isActive?: boolean;
  createdAt: number;
  updatedAt: number;
}
