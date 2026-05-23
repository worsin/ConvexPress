import { createFileRoute } from "@tanstack/react-router";
import { RegionsPage } from "@/components/commerce/EnterpriseCommercePages";

export const Route = createFileRoute("/_authenticated/_admin/commerce/regions")({
  component: RegionsPage,
});
