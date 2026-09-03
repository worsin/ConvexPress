import { CircleCheck, CircleHelp, ExternalLink, History, PackageOpen, ShieldAlert } from "lucide-react";

export function environmentIdentityLabel(
  websiteTitle: string | null,
  environment: {
    instanceKey: string;
    kind: string;
    label: string | null;
  },
) {
  if (!websiteTitle) return environment.instanceKey;
  return `${websiteTitle} — ${environment.label || environment.kind}`;
}

export function EnvironmentBar({
  environment,
  websiteTitle,
  operationsOpen,
  handoffOpen,
  canOpenOperations,
  canOpenHandoff,
  onOpenOperations,
  onOpenHandoff,
}: {
  environment: {
    instanceKey: string;
    kind: string;
    label: string | null;
    siteOrigin: string;
    health: string;
    compatibility: string;
  } | null;
  websiteTitle: string | null;
  operationsOpen: boolean;
  handoffOpen: boolean;
  canOpenOperations: boolean;
  canOpenHandoff: boolean;
  onOpenOperations: () => void;
  onOpenHandoff: () => void;
}) {
  if (!environment) {
    return (
      <div className="shrink-0 border-b border-slate-200 bg-white px-4 py-2 text-xs text-slate-500">
        No environment selected
      </div>
    );
  }
  const isLive = environment.kind === "live";
  const healthy = environment.health === "ok";
  const compatible = environment.compatibility === "compatible";
  return (
    <div
      className={`flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-2 text-xs ${
        isLive
          ? "border-red-300 bg-red-50 text-red-950"
          : "border-amber-200 bg-amber-50 text-amber-950"
      }`}
    >
      <span className="inline-flex items-center gap-1.5 font-extrabold uppercase tracking-[0.16em]">
        {isLive ? <ShieldAlert className="size-4" /> : <CircleHelp className="size-4" />}
        {environment.kind}
      </span>
      <span aria-label="Active website environment" className="font-semibold">
        {environmentIdentityLabel(websiteTitle, environment)}
      </span>
      <span className="inline-flex items-center gap-1">
        {healthy ? <CircleCheck className="size-3.5" /> : <CircleHelp className="size-3.5" />}
        Health: {environment.health}
      </span>
      <span>Contract: {compatible ? "compatible" : environment.compatibility}</span>
      {canOpenOperations ? (
        <button
          aria-expanded={operationsOpen}
          className="inline-flex items-center gap-1.5 border border-current px-2.5 py-1 font-bold hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          onClick={onOpenOperations}
          type="button"
        >
          <History className="size-3.5" aria-hidden="true" /> Site operations
        </button>
      ) : null}
      {canOpenHandoff ? (
        <button
          aria-expanded={handoffOpen}
          className="inline-flex items-center gap-1.5 border border-current px-2.5 py-1 font-bold hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          onClick={onOpenHandoff}
          type="button"
        >
          <PackageOpen className="size-3.5" aria-hidden="true" /> Transfer site
        </button>
      ) : null}
      <a
        className="ml-auto inline-flex items-center gap-1 font-semibold underline underline-offset-2"
        href={environment.siteOrigin}
        rel="noreferrer"
        target="_blank"
      >
        View website <ExternalLink className="size-3" />
      </a>
    </div>
  );
}
