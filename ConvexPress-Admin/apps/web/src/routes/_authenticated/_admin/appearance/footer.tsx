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
import { createFileRoute } from "@tanstack/react-router";
import { FooterComposer } from "@/components/appearance/FooterComposer";
import { DeprecatedSystemBanner } from "@/components/appearance/DeprecatedSystemBanner";

export const Route = createFileRoute(
  "/_authenticated/_admin/appearance/footer",
)({
  component: FooterBuilderPage,
});

function FooterBuilderPage() {
  return (
    <>
      <DeprecatedSystemBanner />
      <FooterComposer />
    </>
  );
}
