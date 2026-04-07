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
