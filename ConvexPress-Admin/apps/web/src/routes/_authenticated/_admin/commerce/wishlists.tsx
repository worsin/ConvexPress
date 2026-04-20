import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "@backend/convex/_generated/api";

import { PluginGuard } from "@/components/plugins/PluginGuard";

export const Route = createFileRoute(
  "/_authenticated/_admin/commerce/wishlists",
)({
  component: CommerceWishlistsRoute,
});

function CommerceWishlistsRoute() {
  return (
    <PluginGuard pluginId="commerceWishlists">
      <CommerceWishlistsPage />
    </PluginGuard>
  );
}

function CommerceWishlistsPage() {
  const analytics = useQuery(
    (api as any).commerceWishlists.queries.getAnalytics,
    {},
  ) as
    | {
        totalWishlists: number;
        totalItems: number;
        publicWishlists: number;
        uniqueUsers: number;
        avgItemsPerWishlist: number;
        recentItems: number;
        monthlyItems: number;
      }
    | null
    | undefined;

  const popularItems = useQuery(
    (api as any).commerceWishlists.queries.getPopularItems,
    { limit: 10 },
  ) as
    | Array<{
        productId: string;
        name: string;
        slug?: string;
        wishlistCount: number;
        status?: string;
      }>
    | null
    | undefined;

  const recentActivity = useQuery(
    (api as any).commerceWishlists.queries.getRecentActivity,
    { limit: 20 },
  ) as
    | Array<{
        _id: string;
        addedAt: number;
        productName: string;
        productSlug?: string;
        userName: string;
      }>
    | null
    | undefined;

  const stats = analytics ?? {
    totalWishlists: 0,
    totalItems: 0,
    publicWishlists: 0,
    uniqueUsers: 0,
    avgItemsPerWishlist: 0,
    recentItems: 0,
    monthlyItems: 0,
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Wishlists</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Customer saves, shared lists, and wishlist demand signals.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <Metric label="Wishlists" value={stats.totalWishlists} />
        <Metric label="Saved Items" value={stats.totalItems} />
        <Metric label="Public Lists" value={stats.publicWishlists} />
        <Metric label="Customers" value={stats.uniqueUsers} />
        <Metric label="Avg. Items" value={stats.avgItemsPerWishlist} />
        <Metric label="30 Days" value={stats.monthlyItems} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-lg border border-border bg-card">
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-base font-semibold">Most Saved Products</h2>
          </div>
          <div className="divide-y divide-border">
            {(popularItems ?? []).length === 0 ? (
              <EmptyRow label="No wishlist product data yet." />
            ) : (
              (popularItems ?? []).map((item) => (
                <div
                  key={item.productId}
                  className="flex items-center justify-between gap-4 px-5 py-4"
                >
                  <div>
                    <div className="font-medium text-foreground">{item.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {item.status ?? "unknown"}
                    </div>
                  </div>
                  <div className="text-sm font-semibold">
                    {item.wishlistCount}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card">
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-base font-semibold">Recent Activity</h2>
          </div>
          <div className="divide-y divide-border">
            {(recentActivity ?? []).length === 0 ? (
              <EmptyRow label="No recent wishlist activity." />
            ) : (
              (recentActivity ?? []).map((entry) => (
                <div key={entry._id} className="px-5 py-4">
                  <div className="font-medium text-foreground">
                    {entry.productSlug ? (
                      <Link
                        to="/commerce/products"
                        search={{ q: entry.productSlug } as any}
                        className="hover:underline"
                      >
                        {entry.productName}
                      </Link>
                    ) : (
                      entry.productName
                    )}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Saved by {entry.userName} on{" "}
                    {new Date(entry.addedAt).toLocaleDateString()}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold text-foreground">{value}</div>
    </div>
  );
}

function EmptyRow({ label }: { label: string }) {
  return <div className="px-5 py-8 text-center text-sm text-muted-foreground">{label}</div>;
}
