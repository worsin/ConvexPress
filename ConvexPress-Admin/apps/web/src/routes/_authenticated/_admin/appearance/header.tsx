/**
 * Appearance > Header — dynamic header composer.
 *
 * Writes to the `header` settings section via Convex. The public Website reads
 * the same section through `useHeaderConfig` and renders `<SiteHeader />` from
 * the live values, so changes here take effect site-wide without a deploy.
 */
import { createFileRoute } from "@tanstack/react-router";
import { HeaderComposer } from "@/components/appearance/HeaderComposer";

export const Route = createFileRoute(
  "/_authenticated/_admin/appearance/header",
)({
  component: HeaderBuilderPage,
});

function HeaderBuilderPage() {
  return <HeaderComposer />;
}
