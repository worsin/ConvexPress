import { createFileRoute } from "@tanstack/react-router";
import { LayoutComposer } from "@/components/layouts/LayoutComposer";

export const Route = createFileRoute("/_authenticated/_admin/layouts/new")({
  component: NewLayoutPage,
});

function NewLayoutPage() {
  return <LayoutComposer />;
}
