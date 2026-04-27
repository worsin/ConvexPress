import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex-helpers/react/cache";
import { api } from "@backend/convex/_generated/api";

export const Route = createFileRoute("/_authenticated/_admin/commerce/customers")({
  component: CommerceCustomersPage,
});

function CommerceCustomersPage() {
  const customers = useQuery((api as any).commerce.customers.list, {}) as
    | Array<{
        _id: string;
        email?: string;
        firstName?: string;
        lastName?: string;
        phone?: string;
        createdAt?: number;
      }>
    | undefined;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Customers</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Customer profiles are now query-backed from the commerce customer
          table. Address management and order-linked detail views will build on
          top of this list.
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="grid grid-cols-[minmax(0,1.5fr)_1fr_1fr_160px] gap-4 border-b border-border px-5 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          <div>Customer</div>
          <div>Email</div>
          <div>Phone</div>
          <div>Created</div>
        </div>

        {customers === undefined ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className="h-16 animate-pulse rounded-xl bg-muted"
              />
            ))}
          </div>
        ) : customers.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm text-muted-foreground">
              No customer profiles exist yet.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {customers.map((customer) => (
              <div
                key={customer._id}
                className="grid grid-cols-[minmax(0,1.5fr)_1fr_1fr_160px] gap-4 px-5 py-4"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-foreground">
                    {[customer.firstName, customer.lastName].filter(Boolean).join(" ") ||
                      "Unnamed customer"}
                  </div>
                  <div className="mt-1 truncate text-xs text-muted-foreground">
                    {customer._id}
                  </div>
                </div>
                <div className="truncate text-sm text-muted-foreground">
                  {customer.email || "—"}
                </div>
                <div className="text-sm text-muted-foreground">
                  {customer.phone || "—"}
                </div>
                <div className="text-sm text-muted-foreground">
                  {customer.createdAt
                    ? new Date(customer.createdAt).toLocaleDateString()
                    : "—"}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
