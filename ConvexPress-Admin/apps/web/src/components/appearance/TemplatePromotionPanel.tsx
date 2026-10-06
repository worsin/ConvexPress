import { ConvexProvider, useQuery } from "convex/react";
import { api as controlApi } from "@control/convex/_generated/api";
import type { Id } from "@control/convex/_generated/dataModel";
import { useControlClient, useControlShell } from "@/control/ControlShellContext";
import { PromotionReviewPanel } from "@/control/components/PromotionReviewPanel";

/** The Customizer uses a site provider; promotion must use the controller. */
export function TemplatePromotionPanel() {
  const control = useControlClient();
  const shell = useControlShell();
  if (!control || !shell || shell.pending || shell.scopeError ||
    !shell.selectedWebsite || !shell.selectedOrganization || !shell.selectedBusiness ||
    shell.selectedEnvironment?.kind !== "staging") return null;
  return <ConvexProvider client={control}>
    <ControllerAppearanceReview
      key={`${shell.operator.id}:${shell.selectedWebsite.websiteId}:${shell.selectedEnvironment.instanceId}`}
      websiteId={shell.selectedWebsite.websiteId}
      websiteKey={shell.selectedWebsite.websiteKey}
      organizationId={shell.selectedOrganization.organizationId}
      businessId={shell.selectedBusiness.businessId}
      sourceInstanceId={shell.selectedEnvironment.instanceId}
    />
  </ConvexProvider>;
}

function ControllerAppearanceReview(props: {
  websiteId: Id<"overseer_websites">;
  websiteKey: string;
  organizationId: string;
  businessId: string;
  sourceInstanceId: string;
}) {
  const environments = useQuery(controlApi.websiteInstances.list, { websiteId: props.websiteId });
  const connections = useQuery(controlApi.connections.queries.listForWebsite, { websiteId: props.websiteId });
  if (!environments || !connections) return <p role="status">Loading promotion environments…</p>;
  return <PromotionReviewPanel {...props} environments={environments} connections={connections}
    appearanceSourceInstanceId={props.sourceInstanceId} />;
}
