import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/_admin/membership/grants")({
  component: MembershipGrantsPage,
});

function MembershipGrantsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold tracking-tight">Membership Grants</h1>
      <p className="text-sm text-muted-foreground">
        Manual grants and subscription-driven grants will be administered here.
      </p>
    </div>
  );
}
