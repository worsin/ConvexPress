/**
 * Integrations hub — every third-party connection for this website on one
 * screen: configured or not, verified against the real API or not, and the
 * controls to fix it right here.
 */

import { api } from "@backend/convex/_generated/api";
import { useAction } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import { AlertTriangle, Loader2, Plug, ShieldAlert } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import Loader from "@/components/loader";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/button";
import { useCan } from "@/hooks/useCan";
import { useAuth } from "@/lib/auth-context";
import {
  buildProviderViews,
  groupViews,
  matchesFilter,
  readinessFor,
  type ProviderFilter,
  type ProviderOverview,
  type ProviderView,
} from "@/lib/integrations/model";
import { cn } from "@/lib/utils";
import { ConfigureDialog } from "./ConfigureDialog";
import { EnvironmentPanel } from "./EnvironmentPanel";
import { ProviderCard } from "./ProviderCard";

const FILTERS: Array<{ id: ProviderFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "attention", label: "Needs attention" },
  { id: "verified", label: "Verified" },
  { id: "optional", label: "Optional" },
];

export function IntegrationsHub({ eyebrow = "Site readiness" }: { eyebrow?: string }) {
  const { isLoading } = useAuth();
  const canManage = useCan("manage_options");
  const overview = useQuery(api.integrations.queries.overview, !isLoading && canManage ? {} : "skip");
  const verify = useAction(api.integrations.actions.verify);

  const [filter, setFilter] = useState<ProviderFilter>("all");
  const [configuring, setConfiguring] = useState<string | null>(null);
  const [verifying, setVerifying] = useState<Set<string>>(new Set());
  const [verifyingAll, setVerifyingAll] = useState(false);

  const views = useMemo(
    () => buildProviderViews(overview?.providers as ProviderOverview[] | undefined),
    [overview],
  );
  const readiness = useMemo(() => readinessFor(views), [views]);
  const visible = useMemo(() => views.filter((view) => matchesFilter(view, filter)), [views, filter]);
  const grouped = useMemo(() => groupViews(visible), [visible]);

  const runVerify = useCallback(
    async (providerId: string, quiet = false) => {
      setVerifying((current) => new Set(current).add(providerId));
      try {
        const result = await verify({ providerId });
        if (!quiet) {
          const title = views.find((view) => view.definition.id === providerId)?.definition.title ?? providerId;
          if (result.status === "verified") toast.success(`${title}: ${result.summary}`);
          else if (result.status === "failed") toast.error(`${title}: ${result.summary}`);
          else toast.message(`${title}: ${result.summary}`);
        }
        return result;
      } finally {
        setVerifying((current) => {
          const next = new Set(current);
          next.delete(providerId);
          return next;
        });
      }
    },
    [verify, views],
  );

  const verifyAll = async () => {
    const targets = views.filter(
      (view) => view.definition.verifiable && !["off", "missing", "tool"].includes(view.status),
    );
    setVerifyingAll(true);
    let ok = 0;
    let failed = 0;
    try {
      for (const view of targets) {
        try {
          const result = await runVerify(view.definition.id, true);
          if (result.status === "verified") ok += 1;
          else if (result.status === "failed") failed += 1;
        } catch {
          failed += 1;
        }
      }
      if (failed === 0) toast.success(`All ${ok} configured integrations verified.`);
      else toast.error(`${failed} of ${ok + failed} integrations failed verification.`);
    } finally {
      setVerifyingAll(false);
    }
  };

  if (isLoading) return <Loader />;
  if (!canManage) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <ShieldAlert className="mb-4 size-10 text-muted-foreground" />
        <h1 className="mb-1 text-lg font-semibold">Integrations are restricted</h1>
        <p className="max-w-md text-[13.5px] text-ink-2">
          Only administrators with the manage options capability can view or change provider connections.
        </p>
      </div>
    );
  }
  if (overview === undefined) return <Loader />;

  const configuringView: ProviderView | undefined = configuring
    ? views.find((view) => view.definition.id === configuring)
    : undefined;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 pb-10">
      <PageHeader
        eyebrow={eyebrow}
        title="Integrations"
        meta={[
          <span key="summary" className="text-ink-2">
            Every provider this website talks to, checked against the real API.
          </span>,
        ]}
        actions={
          <Button variant="outline" onClick={() => void verifyAll()} disabled={verifyingAll}>
            {verifyingAll ? (
              <Loader2 data-icon="inline-start" aria-hidden="true" className="animate-spin" />
            ) : (
              <Plug data-icon="inline-start" aria-hidden="true" />
            )}
            {verifyingAll ? "Verifying…" : "Verify all"}
          </Button>
        }
      />

      <section
        aria-label="Launch readiness"
        className="grid gap-4 rounded-2xl border border-border bg-card p-5 shadow-soft md:grid-cols-[auto_1fr_auto] md:items-center"
      >
        <ReadinessRing ratio={readiness.ratio} />
        <div>
          <p className="text-[18px] font-semibold leading-tight text-foreground">{readiness.label}</p>
          <p className="mt-1 text-[13px] leading-5 text-ink-2">
            {readiness.verified} of {readiness.required} required integrations verified
            {readiness.failing > 0 ? ` · ${readiness.failing} failing` : ""}
            {readiness.attention > 0 ? ` · ${readiness.attention} need attention` : ""}.
          </p>
        </div>
        <div role="group" aria-label="Filter integrations" className="flex flex-wrap gap-1 rounded-[11px] border border-border bg-surface-2 p-[3px]">
          {FILTERS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              aria-pressed={filter === entry.id}
              onClick={() => setFilter(entry.id)}
              className={cn(
                "h-[30px] rounded-lg px-3 text-[12.5px] font-medium text-ink-2 transition-colors hover:text-foreground",
                filter === entry.id && "bg-card text-foreground shadow-soft",
              )}
            >
              {entry.label}
            </button>
          ))}
        </div>
      </section>

      {overview.encryption === "base64" && (
        <p
          role="alert"
          className="flex items-start gap-2.5 rounded-xl border border-warning/40 bg-warning-soft px-4 py-3 text-[13px] leading-5 text-warning"
        >
          <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>
            <span className="font-semibold">Secrets are not encrypted at rest.</span> Set{" "}
            <span className="font-mono">SHIPPING_PROVIDER_ENCRYPTION_KEY</span> on the Convex deployment so saved API keys are
            stored with AES-256-GCM instead of reversible encoding, then re-save each key.
          </span>
        </p>
      )}

      {grouped.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line-strong p-8 text-center text-[13.5px] text-ink-2">
          Nothing matches this filter.
        </p>
      ) : (
        grouped.map(({ group, views: groupViewsList }) => (
          <section key={group.id} aria-label={group.title} className="space-y-3">
            <div className="flex items-baseline gap-3">
              <h2 className="text-[15px] font-semibold text-foreground">{group.title}</h2>
              <span className="text-[12px] text-muted-foreground">{group.blurb}</span>
            </div>
            <div className="grid gap-3.5 md:grid-cols-2 xl:grid-cols-3">
              {groupViewsList.map((view) => (
                <ProviderCard
                  key={view.definition.id}
                  view={view}
                  verifying={verifying.has(view.definition.id)}
                  onConfigure={() => setConfiguring(view.definition.id)}
                  onVerify={() => void runVerify(view.definition.id)}
                />
              ))}
            </div>
          </section>
        ))
      )}

      <EnvironmentPanel />

      {configuringView && (
        <ConfigureDialog
          key={configuringView.definition.id}
          view={configuringView}
          onClose={() => setConfiguring(null)}
          onVerify={async (providerId) => {
            await runVerify(providerId);
          }}
        />
      )}
    </div>
  );
}

function ReadinessRing({ ratio }: { ratio: number }) {
  const size = 72;
  const stroke = 7;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.min(1, Math.max(0, ratio)));
  const percent = Math.round(ratio * 100);
  return (
    <div className="relative grid place-items-center" aria-label={`${percent}% ready`} role="img">
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--line)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={ratio >= 1 ? "var(--success)" : "var(--primary)"}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-500"
        />
      </svg>
      <span className="absolute font-mono text-[13px] font-semibold text-foreground">{percent}%</span>
    </div>
  );
}
