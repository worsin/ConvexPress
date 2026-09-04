/**
 * One provider on the Integrations hub: status, what it unlocks, the last
 * real check, and the actions that matter (configure, verify, open).
 */

import { Link } from "@tanstack/react-router";
import {
  ArrowUpRight,
  CheckCircle2,
  CircleDashed,
  Loader2,
  Plug,
  Settings2,
  XCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { STATUS_LABEL, relativeTime, type ProviderView } from "@/lib/integrations/model";
import { cn } from "@/lib/utils";
import { providerIcon } from "./provider-icons";

const STATUS_STYLE: Record<ProviderView["status"], string> = {
  verified: "border-success/40 bg-success-soft text-success",
  failing: "border-destructive/30 bg-live-soft text-destructive",
  unverified: "border-warning/40 bg-warning-soft text-warning",
  missing: "border-border bg-surface-2 text-ink-2",
  off: "border-border bg-transparent text-muted-foreground",
  tool: "border-border bg-transparent text-muted-foreground",
};

export function ProviderCard({
  view,
  verifying,
  onConfigure,
  onVerify,
}: {
  view: ProviderView;
  verifying: boolean;
  onConfigure: () => void;
  onVerify: () => void;
}) {
  const { definition, status, overview } = view;
  const Icon = providerIcon(definition.id);
  const check = overview?.check ?? null;
  const canVerify = definition.verifiable && status !== "off" && status !== "missing" && status !== "tool";
  const details = check && !check.stale ? check.details.slice(0, 4) : [];

  return (
    <article
      aria-label={`${definition.title} integration`}
      data-status={status}
      className={cn(
        "flex flex-col rounded-2xl border bg-card p-4 shadow-soft transition-colors",
        status === "failing" ? "border-destructive/30" : "border-border",
        status === "off" && "bg-transparent shadow-none",
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "grid size-9 shrink-0 place-items-center rounded-xl border border-border bg-surface-2 text-ink-2",
            status === "verified" && "text-primary",
          )}
        >
          <Icon aria-hidden="true" className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[14.5px] font-semibold leading-tight text-foreground">{definition.title}</h3>
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
                STATUS_STYLE[status],
              )}
            >
              {status === "verified" ? (
                <CheckCircle2 aria-hidden="true" className="size-3" />
              ) : status === "failing" ? (
                <XCircle aria-hidden="true" className="size-3" />
              ) : (
                <CircleDashed aria-hidden="true" className="size-3" />
              )}
              {STATUS_LABEL[status]}
            </span>
            {!view.required && status !== "tool" && (
              <span className="text-[11px] text-muted-foreground">Optional</span>
            )}
          </div>
          <p className="mt-1 text-[12.5px] leading-5 text-ink-2">{view.headline}</p>
        </div>
      </div>

      {definition.unlocks.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Unlocks">
          {definition.unlocks.map((item) => (
            <li
              key={item}
              className={cn(
                "rounded-md border px-1.5 py-0.5 text-[11px]",
                status === "verified"
                  ? "border-primary/30 bg-primary-soft text-foreground"
                  : "border-border text-muted-foreground",
              )}
            >
              {item}
            </li>
          ))}
        </ul>
      )}

      {details.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-border pt-3" aria-label="Last check">
          {details.map((detail) => (
            <li key={detail.label} className="flex items-start gap-2 text-[12px] leading-5">
              {detail.ok ? (
                <CheckCircle2 aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-success" />
              ) : (
                <XCircle aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-warning" />
              )}
              <span className="min-w-0">
                <span className="font-medium text-foreground">{detail.label}</span>
                {detail.note && <span className="text-muted-foreground"> · {detail.note}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}

      {view.envFallbacks.length > 0 && (
        <p className="mt-2 text-[11.5px] text-muted-foreground">
          Using environment {view.envFallbacks.length === 1 ? "variable" : "variables"}{" "}
          <span className="font-mono">{view.envFallbacks.join(", ")}</span>.
        </p>
      )}

      <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
        {status === "tool" ? (
          <Link
            to={definition.toolRoute as never}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-[12.5px] font-medium text-foreground hover:bg-surface-2"
          >
            Open
            <ArrowUpRight aria-hidden="true" className="size-3.5" />
          </Link>
        ) : (
          <>
            <Button size="sm" variant={status === "missing" ? "default" : "outline"} onClick={onConfigure}>
              <Settings2 data-icon="inline-start" aria-hidden="true" />
              {status === "missing" || status === "off" ? "Connect" : "Configure"}
            </Button>
            {canVerify && (
              <Button size="sm" variant="outline" onClick={onVerify} disabled={verifying}>
                {verifying ? (
                  <Loader2 data-icon="inline-start" aria-hidden="true" className="animate-spin" />
                ) : (
                  <Plug data-icon="inline-start" aria-hidden="true" />
                )}
                {verifying ? "Checking…" : "Verify"}
              </Button>
            )}
          </>
        )}
        {definition.advancedRoute && (
          <Link
            to={definition.advancedRoute as never}
            className="ml-auto inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground"
          >
            Advanced
            <ArrowUpRight aria-hidden="true" className="size-3" />
          </Link>
        )}
        {check && (
          <span className="text-[11px] text-muted-foreground" title={new Date(check.checkedAt).toLocaleString()}>
            {check.latencyMs !== null ? `${check.latencyMs} ms · ` : ""}
            {relativeTime(check.checkedAt)}
          </span>
        )}
      </div>
    </article>
  );
}
