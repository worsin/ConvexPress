import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import { Truck, Webhook, Clock, AlertTriangle, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute(
  "/_authenticated/_admin/commerce/shipping/tracking",
)({
  component: TrackingHealthPage,
});

type Health = {
  windowSize: number;
  webhookCount: number;
  pollCount: number;
  webhookShare: number;
  last24h: number;
  last7d: number;
  lastReceivedAt: number | null;
  lastWebhookAt: number | null;
  lastPollAt: number | null;
  statusCounts: Record<string, number>;
  perProviderWebhook: Record<string, number>;
  activeShipmentStatusCounts: Record<string, number>;
  uniqueShipmentsInWindow: number;
};

function formatRelative(ts: number | null) {
  if (!ts) return "never";
  const diffMs = Date.now() - ts;
  const mins = Math.round(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

function TrackingHealthPage() {
  const health = useQuery(
    (api as any).shipping.tracking.queries.getTrackingHealth,
    {},
  ) as Health | undefined;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Truck className="h-6 w-6 text-muted-foreground" />
        <div>
          <h1 className="text-xl font-semibold text-foreground">
            Tracking Sync Health
          </h1>
          <p className="text-sm text-muted-foreground">
            Live stats over the most recent 500 tracking events. Webhooks are
            preferred; the 4-hour cron fills any gaps.
          </p>
        </div>
      </div>

      {health === undefined ? (
        <p className="text-sm text-muted-foreground">Loading health stats…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard
              icon={<Webhook className="h-4 w-4" />}
              label="Webhook share"
              value={`${Math.round(health.webhookShare * 100)}%`}
              sub={`${health.webhookCount} / ${health.windowSize} events`}
            />
            <StatCard
              icon={<Clock className="h-4 w-4" />}
              label="Last event"
              value={formatRelative(health.lastReceivedAt)}
              sub={`W: ${formatRelative(health.lastWebhookAt)} · P: ${formatRelative(health.lastPollAt)}`}
            />
            <StatCard
              icon={<Clock className="h-4 w-4" />}
              label="Last 24h"
              value={String(health.last24h)}
              sub={`${health.last7d} in last 7d`}
            />
            <StatCard
              icon={<Truck className="h-4 w-4" />}
              label="Active shipments"
              value={String(health.uniqueShipmentsInWindow)}
              sub="distinct in window"
            />
          </div>

          <section className="rounded-lg border border-border bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold text-foreground">
              Status distribution (event window)
            </h2>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              {Object.entries(health.statusCounts).map(([status, count]) => (
                <div
                  key={status}
                  className="rounded-md border border-border bg-background p-2 text-sm"
                >
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    {status.replace(/_/g, " ")}
                  </div>
                  <div className="text-lg font-semibold text-foreground">
                    {count}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-border bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold text-foreground">
              Webhook activity by provider
            </h2>
            {Object.keys(health.perProviderWebhook).length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No webhook deliveries yet. Check signature headers and admin
                credentials if carriers should be reporting.
              </p>
            ) : (
              <div className="space-y-2">
                {Object.entries(health.perProviderWebhook).map(
                  ([provider, count]) => (
                    <div
                      key={provider}
                      className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-1.5 text-sm"
                    >
                      <span className="capitalize text-foreground">{provider}</span>
                      <span className="text-muted-foreground">{count} events</span>
                    </div>
                  ),
                )}
              </div>
            )}
          </section>

          <section className="rounded-lg border border-border bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold text-foreground">
              In-flight shipment state
            </h2>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <InflightStat
                icon={<Truck className="h-4 w-4 text-muted-foreground" />}
                label="In transit"
                value={health.activeShipmentStatusCounts.in_transit ?? 0}
              />
              <InflightStat
                icon={<Truck className="h-4 w-4 text-sky-500" />}
                label="Out for delivery"
                value={health.activeShipmentStatusCounts.out_for_delivery ?? 0}
              />
              <InflightStat
                icon={<CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                label="Delivered"
                value={health.activeShipmentStatusCounts.delivered ?? 0}
              />
              <InflightStat
                icon={<AlertTriangle className="h-4 w-4 text-destructive" />}
                label="Exception"
                value={health.activeShipmentStatusCounts.exception ?? 0}
              />
            </div>
          </section>
        </>
      )}

      <section className="rounded-lg border border-border bg-card p-6">
        <h2 className="text-sm font-semibold text-foreground">How tracking works</h2>
        <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
          <li>
            <strong>Webhooks (preferred):</strong> ShipStation/FedEx/UPS POST to
            <code className="mx-1 rounded bg-muted px-1 py-0.5 text-xs">/webhooks/&lt;provider&gt;</code>
            on every status change. HMAC-SHA256 signature verification protects
            against spoofing, plus per-delivery replay dedup.
          </li>
          <li>
            <strong>Polling fallback:</strong> The
            <code className="mx-1 rounded bg-muted px-1 py-0.5 text-xs">shipping:tracking-sync</code>
            cron calls each carrier every 4 hours for in-transit shipments.
          </li>
          <li>
            <strong>Auto-fulfillment:</strong> When all packages in an order reach
            <code className="mx-1 rounded bg-muted px-1 py-0.5 text-xs">delivered</code>,
            the order's <em>fulfillmentStatus</em> auto-updates to
            <code className="mx-1 rounded bg-muted px-1 py-0.5 text-xs">fulfilled</code>.
          </li>
          <li>
            <strong>Customer notifications:</strong> Status transitions queue
            emails via the
            <code className="mx-1 rounded bg-muted px-1 py-0.5 text-xs">shipping_&lt;status&gt;</code>
            templates, which auto-seed when the shipping integration is saved.
          </li>
          <li>
            <strong>Public tracking page:</strong> Customers visit
            <code className="mx-1 rounded bg-muted px-1 py-0.5 text-xs">/track/&lt;trackingToken&gt;</code>
            on the website to see their shipment timeline.
          </li>
        </ul>
      </section>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold text-foreground">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

function InflightStat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-md border border-border bg-background p-2">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold text-foreground">{value}</div>
    </div>
  );
}
