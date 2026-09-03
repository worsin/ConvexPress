/**
 * People — every control-plane operator, what they can reach, and invites.
 * Website customers never appear here; they live inside each site database.
 */

import { api as controlApi } from "@control/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { UserPlus } from "lucide-react";

import { initialsFor } from "@/components/shell/environment-presentation";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/button";
import { useControlShell } from "@/control/ControlShellContext";
import type { WorkspaceApi } from "../SitesWorkspace";
import { Notice } from "../forms";
import { useSitesAccess } from "../useSitesAccess";

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Administrator",
  manager: "Business manager",
  member: "Member",
  viewer: "Viewer",
};

export function profileSummary(operator: {
  role: string;
  access: Array<{ targetType: string; level: string }>;
}): string {
  if (operator.role === "owner") return "Owner";
  if (operator.role === "admin") return "Administrator";
  if (operator.access.some((grant) => grant.targetType === "business" && grant.level === "manage")) {
    return "Business Manager";
  }
  if (operator.access.some((grant) => grant.targetType === "website" && grant.level === "manage")) {
    return "Site Operator";
  }
  return operator.role === "member" ? "Member" : "Viewer";
}

export function PeoplePage({ api }: { api: WorkspaceApi }) {
  const shell = useControlShell()!;
  const access = useSitesAccess({});
  const scopedProfile = useQuery(controlApi.operators.currentScopeProfile, {});
  const operators = useQuery(
    controlApi.operators.list,
    access.managePeople ? { limit: 200 } : "skip",
  );
  const setActive = useMutation(controlApi.operators.setActive);
  const roleLabel = scopedProfile?.effectiveLabel ?? ROLE_LABELS[shell.operator.role] ?? shell.operator.role;

  return (
    <div className="space-y-7">
      <PageHeader
        size="md"
        eyebrow="Control-plane operators"
        title="People"
        meta={[
          <span key="me">
            You are signed in as <span className="font-medium text-foreground">{roleLabel}</span>
          </span>,
        ]}
        actions={
          access.managePeople ? (
            <Button onClick={() => api.openDialog({ kind: "invite" })}>
              <UserPlus data-icon="inline-start" aria-hidden="true" />
              Invite operator
            </Button>
          ) : undefined
        }
      />

      <p className="max-w-2xl text-[13.5px] leading-6 text-ink-2">
        Operators sign in to ConvexPress itself and see only the organizations, businesses,
        websites, and environments they are granted. Customer accounts stay isolated inside
        each website database and never appear here.
      </p>

      {access.loading ? (
        <Notice tone="pending">Checking your permissions…</Notice>
      ) : !access.managePeople ? (
        <Notice tone="info">
          Only the installation owner or an administrator can invite operators or change outer access.
          Your assigned sites remain available through the site switcher.
        </Notice>
      ) : (
        <section aria-label="Control-plane operators" className="rounded-xl border border-border bg-card shadow-soft">
          <div className="flex items-center justify-between px-[18px] pb-2.5 pt-3.5">
            <h2 className="text-[15px] font-semibold">Current operators</h2>
            <span className="text-[12px] text-muted-foreground">
              {operators ? `${operators.length} ${operators.length === 1 ? "operator" : "operators"}` : ""}
            </span>
          </div>
          {operators === undefined ? (
            <p className="border-t border-border px-[18px] py-4 text-[13px] text-muted-foreground">Loading operators…</p>
          ) : (
            <ul className="divide-y divide-border border-t border-border">
              {operators.map((operator) => {
                const name = operator.name ?? operator.email ?? "Unnamed operator";
                return (
                  <li
                    key={operator.userId}
                    aria-label={`Operator ${operator.email ?? operator.name ?? operator.userId}`}
                    className="flex flex-wrap items-center gap-3 px-[18px] py-3"
                  >
                    <span className="grid size-8 place-items-center rounded-full bg-foreground text-[11px] font-semibold text-background">
                      {initialsFor(name)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-semibold text-foreground">{name}</span>
                      <span className="block truncate text-[12px] text-muted-foreground">
                        {operator.email ?? "No login email"} · {profileSummary(operator)}
                      </span>
                      {operator.access.length > 0 && (
                        <span className="mt-1.5 flex flex-wrap gap-1.5">
                          {operator.access.map((grant) => (
                            <span
                              key={`${grant.targetType}-${grant.targetId}`}
                              className="rounded-md border border-border bg-surface-2 px-1.5 py-px text-[11px] text-ink-2"
                            >
                              {grant.targetLabel} · {grant.level}
                              {grant.includeEnvironments ? " + environments" : ""}
                            </span>
                          ))}
                        </span>
                      )}
                    </span>
                    <span
                      className={
                        operator.isActive
                          ? operator.hasLogin
                            ? "rounded-md bg-success-soft px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-success"
                            : "rounded-md bg-warning-soft px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-warning"
                          : "rounded-md bg-muted px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground"
                      }
                    >
                      {operator.isActive ? (operator.hasLogin ? "Active login" : "Claimable") : "Inactive"}
                    </span>
                    {operator.role !== "owner" && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={api.pending !== null}
                        onClick={() =>
                          void api.run(
                            `active-${operator.userId}`,
                            () => setActive({ userId: operator.userId, isActive: !operator.isActive }),
                            `${name} ${operator.isActive ? "deactivated" : "reactivated"}.`,
                          )
                        }
                      >
                        {operator.isActive ? "Deactivate" : "Reactivate"}
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
