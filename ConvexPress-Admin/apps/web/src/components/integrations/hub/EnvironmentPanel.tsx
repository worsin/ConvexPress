/**
 * Runtime environment — which deployment variables are actually set.
 * Presence only; values never leave the backend.
 */

import { api } from "@backend/convex/_generated/api";
import { useQuery } from "convex-helpers/react/cache";
import { ChevronDown, ExternalLink } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";

interface EnvironmentGroup {
  group: string;
  description: string;
  keys: Array<{ name: string; detail: string; optional: boolean; set: boolean }>;
}

export function EnvironmentPanel({ deploymentLabel }: { deploymentLabel?: string | null }) {
  const groups = useQuery(api.integrations.queries.environment, {}) as EnvironmentGroup[] | undefined;
  const [open, setOpen] = useState(false);
  const total = groups?.reduce((sum, group) => sum + group.keys.length, 0) ?? 0;
  const set = groups?.reduce((sum, group) => sum + group.keys.filter((key) => key.set).length, 0) ?? 0;
  const missingRequired =
    groups?.flatMap((group) => group.keys.filter((key) => !key.set && !key.optional)) ?? [];

  return (
    <section aria-label="Deployment environment" className="rounded-2xl border border-border bg-card shadow-soft">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
      >
        <span>
          <span className="block text-[14.5px] font-semibold text-foreground">Deployment environment</span>
          <span className="block text-[12.5px] text-ink-2">
            {groups === undefined
              ? "Checking…"
              : missingRequired.length
                ? `${missingRequired.length} required variable${missingRequired.length === 1 ? "" : "s"} missing · ${set} of ${total} set`
                : `${set} of ${total} variables set${deploymentLabel ? ` on ${deploymentLabel}` : ""}`}
          </span>
        </span>
        <ChevronDown aria-hidden="true" className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && groups && (
        <div className="grid gap-5 border-t border-border px-5 py-4 md:grid-cols-2">
          {groups.map((group) => (
            <div key={group.group}>
              <h3 className="text-[13px] font-semibold text-foreground">{group.group}</h3>
              <p className="mt-0.5 text-[12px] text-muted-foreground">{group.description}</p>
              <ul className="mt-2 space-y-1.5">
                {group.keys.map((key) => (
                  <li key={key.name} className="flex items-start justify-between gap-3 rounded-lg border border-border px-3 py-2">
                    <span className="min-w-0">
                      <span className="block break-all font-mono text-[11.5px] text-foreground">{key.name}</span>
                      <span className="block text-[11.5px] leading-4 text-muted-foreground">{key.detail}</span>
                    </span>
                    <span
                      className={cn(
                        "shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium",
                        key.set
                          ? "border-success/40 bg-success-soft text-success"
                          : key.optional
                            ? "border-border text-muted-foreground"
                            : "border-warning/40 bg-warning-soft text-warning",
                      )}
                    >
                      {key.set ? "Set" : key.optional ? "Optional" : "Missing"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <p className="text-[12px] text-muted-foreground md:col-span-2">
            Variables are managed on the Convex deployment, never in this app.{" "}
            <a
              href="https://dashboard.convex.dev/"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-foreground hover:text-primary"
            >
              Open the Convex dashboard
              <ExternalLink aria-hidden="true" className="size-3" />
            </a>
          </p>
        </div>
      )}
    </section>
  );
}
