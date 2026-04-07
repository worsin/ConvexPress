import { createFileRoute } from "@tanstack/react-router";
import { FooterComposer } from "@/components/appearance/FooterComposer";

export const Route = createFileRoute(
  "/_authenticated/_admin/appearance/footer",
)({
  component: FooterBuilderPage,
});

function FooterBuilderPage() {
  return <FooterComposer />;
}
