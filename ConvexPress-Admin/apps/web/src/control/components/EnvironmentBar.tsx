import { CircleCheck, CircleHelp, ExternalLink, ShieldAlert } from "lucide-react";

export function EnvironmentBar({
  environment,
}: {
  environment: {
    instanceKey: string;
    kind: string;
    label: string | null;
    siteOrigin: string;
    health: string;
    compatibility: string;
  } | null;
}) {
  if (!environment) {
    return (
      <div className="border-b border-slate-200 bg-white px-4 py-2 text-xs text-slate-500">
        No environment selected
      </div>
    );
  }
  const isLive = environment.kind === "live";
  const healthy = environment.health === "ok";
  const compatible = environment.compatibility === "compatible";
  return (
    <div
      className={`flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-2 text-xs ${
        isLive
          ? "border-red-300 bg-red-50 text-red-950"
          : "border-amber-200 bg-amber-50 text-amber-950"
      }`}
    >
      <span className="inline-flex items-center gap-1.5 font-extrabold uppercase tracking-[0.16em]">
        {isLive ? <ShieldAlert className="size-4" /> : <CircleHelp className="size-4" />}
        {environment.kind}
      </span>
      <span className="font-semibold">{environment.label || environment.instanceKey}</span>
      <span className="inline-flex items-center gap-1">
        {healthy ? <CircleCheck className="size-3.5" /> : <CircleHelp className="size-3.5" />}
        Health: {environment.health}
      </span>
      <span>Contract: {compatible ? "compatible" : environment.compatibility}</span>
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
