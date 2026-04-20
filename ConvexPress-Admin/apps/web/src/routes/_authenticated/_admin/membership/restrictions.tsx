import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/_authenticated/_admin/membership/restrictions",
)({
  component: MembershipRestrictionsPage,
});

function MembershipRestrictionsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold tracking-tight">Restrictions</h1>
      <p className="text-sm text-muted-foreground">
        Page, post, route, and plan-based restriction rules will be managed in
        this section.
      </p>
    </div>
  );
}
