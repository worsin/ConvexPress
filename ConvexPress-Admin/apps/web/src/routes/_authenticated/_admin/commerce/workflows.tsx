import { createFileRoute } from "@tanstack/react-router";
import { WorkflowsPage } from "@/components/commerce/EnterpriseCommercePages";

export const Route = createFileRoute("/_authenticated/_admin/commerce/workflows")({
  component: WorkflowsPage,
});
