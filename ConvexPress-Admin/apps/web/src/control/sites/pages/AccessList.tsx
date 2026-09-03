/**
 * Operators with access to a node. Only rendered for operators who may
 * manage people; everyone else simply doesn't see it.
 */

import { api as controlApi } from "@control/convex/_generated/api";
import { useQuery } from "convex/react";
import { UserPlus } from "lucide-react";

import { initialsFor } from "@/components/shell/environment-presentation";
import { Button } from "@/components/ui/button";
import type { WorkspaceApi } from "../SitesWorkspace";

export function AccessList({
  api,
  targetType,
  targetId,
  label,
  inviteScope,
  canManagePeople,
}: {
  api: WorkspaceApi;
  targetType: "organization" | "business" | "website";
  targetId: string;
  label: string;
  inviteScope?: { organizationId?: string; businessId?: string; websiteId?: string };
  /** From the page's `useSitesAccess`, so this list adds no subscription of its own. */
  canManagePeople: boolean;
}) {
  const operators = useQuery(
    controlApi.operators.list,
    canManagePeople ? { limit: 200 } : "skip",
  );
  if (!canManagePeople) return null;

  const withAccess = (operators ?? []).filter(
    (operator) =>
      operator.isActive &&
      (operator.role === "owner" ||
        operator.role === "admin" ||
        operator.access.some((grant) => grant.targetType === targetType && grant.targetId === targetId)),
  );

  return (
    <section aria-label={`Who can access ${label}`} className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-[15px] font-semibold">People with access</h2>
        <Button
          variant="outline"
          size="sm"
          onClick={() => api.openDialog({ kind: "invite", ...(inviteScope ?? {}) })}
        >
          <UserPlus data-icon="inline-start" aria-hidden="true" />
          Invite
        </Button>
      </div>
      {operators === undefined ? (
        <p className="text-[13px] text-muted-foreground">Loading access…</p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card shadow-soft">
          {withAccess.map((operator) => {
            const name = operator.name ?? operator.email ?? "Operator";
            const grant = operator.access.find(
              (entry) => entry.targetType === targetType && entry.targetId === targetId,
            );
            const summary =
              operator.role === "owner"
                ? "Owner · everything"
                : operator.role === "admin"
                  ? "Administrator · everything"
                  : grant
                    ? `${grant.level === "manage" ? "Manage" : "Use"}${grant.includeEnvironments ? " · with environments" : ""}`
                    : "";
            return (
              <li key={operator.userId} className="flex items-center gap-3 px-4 py-2.5">
                <span className="grid size-7 place-items-center rounded-full bg-foreground text-[10.5px] font-semibold text-background">
                  {initialsFor(name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium text-foreground">{name}</span>
                  <span className="block truncate text-[12px] text-muted-foreground">
                    {operator.email ?? "No login email"} · {summary}
                    {!operator.hasLogin && " · invitation not claimed"}
                  </span>
                </span>
              </li>
            );
          })}
          {withAccess.length === 0 && (
            <li className="px-4 py-3 text-[13px] text-muted-foreground">No one has direct access yet.</li>
          )}
        </ul>
      )}
    </section>
  );
}
