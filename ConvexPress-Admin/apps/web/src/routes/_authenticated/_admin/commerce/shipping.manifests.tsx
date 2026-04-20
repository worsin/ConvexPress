import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import { toast } from "sonner";
import { ClipboardList, CheckCircle2, AlertCircle, Clock } from "lucide-react";

export const Route = createFileRoute(
  "/_authenticated/_admin/commerce/shipping/manifests",
)({
  component: ManifestsPage,
});

const STATUS_FILTER = ["all", "pending", "submitted", "closed", "failed"] as const;

function ManifestsPage() {
  const [filter, setFilter] = useState<(typeof STATUS_FILTER)[number]>("all");
  const manifests = useQuery((api as any).shipping.manifests.queries.list, {
    status: filter === "all" ? undefined : filter,
  }) as any[] | undefined;
  const closeManifest = useMutation(
    (api as any).shipping.manifests.mutations.closeManifest,
  );

  async function handleClose(manifestId: string) {
    if (!confirm("Close this manifest now? Carrier submission will fire.")) return;
    try {
      await closeManifest({ manifestId });
      toast.success("Manifest closed.");
    } catch (err: any) {
      toast.error(err?.data?.message ?? "Failed to close manifest.");
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex items-center gap-3">
        <ClipboardList className="h-6 w-6 text-muted-foreground" />
        <div>
          <h1 className="text-xl font-semibold text-foreground">Shipping Manifests</h1>
          <p className="text-sm text-muted-foreground">
            End-of-day manifests group purchased labels into a carrier pickup.
            Auto-closes hourly per carrier cutoff (USPS 5pm, UPS 6pm, FedEx 7pm).
          </p>
        </div>
      </div>

      <div className="flex gap-2">
        {STATUS_FILTER.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFilter(s)}
            className={`rounded-md px-3 py-1.5 text-sm capitalize ${
              filter === s
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {manifests === undefined ? (
        <p className="text-sm text-muted-foreground">Loading manifests...</p>
      ) : manifests.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center">
          <ClipboardList className="mx-auto h-10 w-10 text-muted-foreground/50" />
          <p className="mt-2 text-sm text-muted-foreground">No manifests yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {manifests.map((m: any) => (
            <div key={m._id} className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <StatusIcon status={m.status} />
                    <h3 className="font-semibold text-foreground">
                      {m.manifestDate} · {m.carrierCode?.toUpperCase()}
                    </h3>
                    <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                      {m.provider}
                    </span>
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {m.totalPackages} packages
                    {m.externalManifestId && ` · ID ${m.externalManifestId}`}
                    {m.errorMessage && ` · Error: ${m.errorMessage}`}
                  </div>
                  {m.submittedAt && (
                    <div className="mt-1 text-xs text-muted-foreground">
                      Submitted {new Date(m.submittedAt).toLocaleString()}
                    </div>
                  )}
                </div>
                {m.status === "pending" && (
                  <button
                    type="button"
                    onClick={() => handleClose(m._id)}
                    className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                  >
                    Close now
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusIcon({ status }: { status: string }) {
  if (status === "submitted" || status === "closed")
    return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
  if (status === "failed") return <AlertCircle className="h-4 w-4 text-destructive" />;
  return <Clock className="h-4 w-4 text-amber-600" />;
}
