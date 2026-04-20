import { createFileRoute } from "@tanstack/react-router";

import { PublicPluginGate } from "@/components/plugins/PublicPluginGate";

export const Route = createFileRoute("/dashboard/membership")({
  component: DashboardMembershipPage,
});

function DashboardMembershipPage() {
  return (
    <PublicPluginGate pluginId="membership">
      <div className="space-y-4">
        <h1 className="text-3xl font-bold tracking-tight">Membership</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Member plan status, active grants, and restricted-content summaries
          will be shown here.
        </p>
      </div>
    </PublicPluginGate>
  );
}
