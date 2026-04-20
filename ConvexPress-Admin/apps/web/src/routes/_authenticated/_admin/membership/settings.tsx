import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/_authenticated/_admin/membership/settings",
)({
  component: MembershipSettingsPage,
});

function MembershipSettingsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold tracking-tight">Membership Settings</h1>
      <p className="text-sm text-muted-foreground">
        Membership enablement, defaults, and restriction behavior controls will
        live here.
      </p>
    </div>
  );
}
