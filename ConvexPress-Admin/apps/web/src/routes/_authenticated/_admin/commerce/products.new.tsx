import { createFileRoute } from "@tanstack/react-router";

import { CommerceProductEditor } from "@/components/commerce/CommerceProductEditor";

export const Route = createFileRoute(
  "/_authenticated/_admin/commerce/products/new",
)({
  component: CommerceNewProductPage,
});

function CommerceNewProductPage() {
  return <CommerceProductEditor mode="create" />;
}
