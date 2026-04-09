import { Link } from "@tanstack/react-router";

export function ProviderConnectionCard(props: {
  provider: string;
  title: string;
  description: string;
  to: string;
  status?: string | null;
  accountCount?: number;
  implementationStatus?: string;
  footerNote?: string;
  operations?: {
    rates?: string;
    labels?: string;
    tracking?: string;
    manifests?: string;
    returns?: string;
    address_validation?: string;
  };
}) {
  const status = props.status ?? "disconnected";

  return (
    <Link
      to={props.to}
      className="rounded-xl border border-border bg-card p-5 transition-colors hover:bg-muted/40"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-foreground">{props.title}</h3>
          <p className="text-xs text-muted-foreground">{props.description}</p>
        </div>
        <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {status}
        </span>
      </div>
      {/* Capability badges */}
      <div className="flex flex-wrap gap-1.5 mt-2">
        {props.operations?.rates === "implemented" && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600">Rates</span>
        )}
        {props.operations?.labels === "implemented" && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600">Labels</span>
        )}
        {props.operations?.tracking === "implemented" && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-600">Tracking</span>
        )}
        {props.operations?.labels === "planned" && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/5 text-foreground/40">Labels (planned)</span>
        )}
        {props.operations?.tracking === "planned" && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/5 text-foreground/40">Tracking (planned)</span>
        )}
      </div>
      <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
        <span>Provider: {props.provider}</span>
        <span>
          {props.footerNote ??
            `${props.implementationStatus ?? "foundation"} • ${props.accountCount ?? 0} synced accounts`}
        </span>
      </div>
    </Link>
  );
}
