# Phase 5: Admin Dashboard

> **Duration:** 2-3 days
> **Prerequisites:** Phase 3 (Core Mutations)
> **Can Parallel With:** Phase 4 (Customer Portal)

---

## Objective

Build the admin interface for subscription management including dashboard metrics, subscription list, detail views, and management tools.

---

## Tasks

### 5.1 Create Admin Route Structure

Create the following routes in `admin-app/apps/web/src/routes/`:

```
_admin/
├── subscriptions/
│   ├── index.tsx           # Dashboard with metrics
│   ├── list.tsx            # Subscription list
│   ├── $id.tsx             # Subscription detail
│   ├── templates.tsx       # Template management (Phase 2)
│   └── templates.$id.tsx   # Template editor (Phase 2)
```

---

### 5.2 Subscription Dashboard

Create `admin-app/apps/web/src/routes/_admin/subscriptions/index.tsx`:

```tsx
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "@admin-app/backend/convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DollarSign,
  Users,
  UserMinus,
  AlertTriangle,
  TrendingUp,
  ListPlus,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";

export const Route = createFileRoute("/_admin/subscriptions/")({
  component: SubscriptionsDashboard,
});

function SubscriptionsDashboard() {
  const metrics = useQuery(api.subscriptions.subscriptions.getMetrics, {});
  const recentActivity = useQuery(
    api.subscriptions.subscriptions.getRecentActivity,
    {}
  );

  if (metrics === undefined) {
    return <div>Loading...</div>;
  }

  return (
    <div className="container py-6">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Subscriptions</h1>
          <p className="text-muted-foreground">
            Manage subscriptions and view metrics
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/subscriptions/list">
            <Button variant="outline">View All Subscriptions</Button>
          </Link>
          <Link to="/subscriptions/templates">
            <Button variant="outline">Manage Templates</Button>
          </Link>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <MetricCard
          title="MRR"
          value={formatCurrency(metrics.mrr)}
          description="Monthly Recurring Revenue"
          icon={DollarSign}
          trend={+12.5} // TODO: Calculate from history
        />
        <MetricCard
          title="Active Subscriptions"
          value={metrics.activeSubscriptionCount}
          description="Currently active"
          icon={Users}
        />
        <MetricCard
          title="Team Members"
          value={metrics.activeItemCount}
          description="Active subscription items"
          icon={ListPlus}
        />
        <MetricCard
          title="Avg Items/Sub"
          value={metrics.avgItemsPerSubscription.toFixed(1)}
          description="Items per subscription"
          icon={TrendingUp}
        />
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Card className="border-yellow-200 bg-yellow-50">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-yellow-800 font-medium">Trialing</p>
                <p className="text-2xl font-bold text-yellow-900">
                  {metrics.trialingCount}
                </p>
              </div>
              <Users className="w-8 h-8 text-yellow-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-red-800 font-medium">Past Due</p>
                <p className="text-2xl font-bold text-red-900">
                  {metrics.pastDueCount}
                </p>
              </div>
              <AlertTriangle className="w-8 h-8 text-red-600" />
            </div>
            {metrics.pastDueCount > 0 && (
              <Link to="/subscriptions/list?status=past_due">
                <Button variant="link" className="text-red-800 p-0 mt-2">
                  View All →
                </Button>
              </Link>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-muted-foreground font-medium">ARR</p>
                <p className="text-2xl font-bold">
                  {formatCurrency(metrics.arr)}
                </p>
              </div>
              <TrendingUp className="w-8 h-8 text-green-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {recentActivity === undefined ? (
            <div>Loading...</div>
          ) : recentActivity.length === 0 ? (
            <p className="text-muted-foreground">No recent activity</p>
          ) : (
            <div className="space-y-4">
              {recentActivity.map((activity) => (
                <ActivityItem key={activity._id} activity={activity} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({
  title,
  value,
  description,
  icon: Icon,
  trend,
}: {
  title: string;
  value: string | number;
  description: string;
  icon: any;
  trend?: number;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm text-muted-foreground">{title}</p>
          <Icon className="w-4 h-4 text-muted-foreground" />
        </div>
        <div className="flex items-baseline gap-2">
          <p className="text-2xl font-bold">{value}</p>
          {trend !== undefined && (
            <span
              className={`text-sm ${trend > 0 ? "text-green-600" : "text-red-600"}`}
            >
              {trend > 0 ? "+" : ""}
              {trend}%
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
      </CardContent>
    </Card>
  );
}

function ActivityItem({ activity }: { activity: any }) {
  const actionLabels: Record<string, string> = {
    created: "New subscription",
    item_added: "Item added",
    item_canceled: "Item canceled",
    canceled: "Subscription canceled",
    payment_succeeded: "Payment received",
    payment_failed: "Payment failed",
  };

  return (
    <div className="flex items-center justify-between py-2 border-b last:border-0">
      <div>
        <p className="font-medium">
          {actionLabels[activity.action] || activity.action}
        </p>
        <p className="text-sm text-muted-foreground">
          {activity.subscriptionNumber}
          {activity.customerName && ` • ${activity.customerName}`}
        </p>
      </div>
      <p className="text-sm text-muted-foreground">
        {new Date(activity.timestamp).toLocaleDateString()}
      </p>
    </div>
  );
}
```

---

### 5.3 Subscription List Page

Create `admin-app/apps/web/src/routes/_admin/subscriptions/list.tsx`:

```tsx
import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "@admin-app/backend/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useState } from "react";

export const Route = createFileRoute("/_admin/subscriptions/list")({
  component: SubscriptionListPage,
  validateSearch: (search: Record<string, unknown>) => ({
    status: (search.status as string) || undefined,
  }),
});

function SubscriptionListPage() {
  const { status: urlStatus } = Route.useSearch();
  const [statusFilter, setStatusFilter] = useState(urlStatus || "all");
  const [searchQuery, setSearchQuery] = useState("");

  const subscriptions = useQuery(api.subscriptions.subscriptions.list, {
    status: statusFilter === "all" ? undefined : statusFilter,
    limit: 50,
  });

  if (subscriptions === undefined) {
    return <div>Loading...</div>;
  }

  // Client-side search filtering
  const filteredSubscriptions = searchQuery
    ? subscriptions.filter(
        (sub) =>
          sub.subscriptionNumber
            .toLowerCase()
            .includes(searchQuery.toLowerCase()) ||
          sub.customer?.email
            ?.toLowerCase()
            .includes(searchQuery.toLowerCase()) ||
          sub.customer?.firstName
            ?.toLowerCase()
            .includes(searchQuery.toLowerCase()) ||
          sub.customer?.lastName
            ?.toLowerCase()
            .includes(searchQuery.toLowerCase())
      )
    : subscriptions;

  return (
    <div className="container py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">All Subscriptions</h1>
        <Link to="/subscriptions">
          <Button variant="outline">Back to Dashboard</Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="flex gap-4 mb-6">
        <Input
          placeholder="Search by customer or subscription #..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="max-w-sm"
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="trialing">Trialing</SelectItem>
            <SelectItem value="paused">Paused</SelectItem>
            <SelectItem value="past_due">Past Due</SelectItem>
            <SelectItem value="canceled">Canceled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Results count */}
      <p className="text-sm text-muted-foreground mb-4">
        {filteredSubscriptions.length} subscriptions
      </p>

      {/* Table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Subscription #</TableHead>
            <TableHead>Customer</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Items</TableHead>
            <TableHead>Monthly</TableHead>
            <TableHead>Next Billing</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredSubscriptions.map((sub) => (
            <TableRow key={sub._id}>
              <TableCell className="font-medium">
                <Link
                  to="/subscriptions/$id"
                  params={{ id: sub._id }}
                  className="hover:underline"
                >
                  {sub.subscriptionNumber}
                </Link>
              </TableCell>
              <TableCell>
                <div>
                  <p className="font-medium">
                    {sub.customer?.firstName} {sub.customer?.lastName}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {sub.customer?.email}
                  </p>
                </div>
              </TableCell>
              <TableCell>
                <StatusBadge status={sub.status} />
              </TableCell>
              <TableCell>{sub.itemCount}</TableCell>
              <TableCell>{formatCurrency(sub.monthlyTotal)}</TableCell>
              <TableCell>
                {sub.nextPaymentDate
                  ? formatDate(sub.nextPaymentDate)
                  : "-"}
              </TableCell>
              <TableCell>
                <Link to="/subscriptions/$id" params={{ id: sub._id }}>
                  <Button variant="outline" size="sm">
                    View
                  </Button>
                </Link>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    active: "default",
    trialing: "outline",
    paused: "secondary",
    past_due: "destructive",
    canceled: "secondary",
  };

  return <Badge variant={variants[status] || "secondary"}>{status}</Badge>;
}
```

---

### 5.4 Subscription Detail Page (Admin)

Create `admin-app/apps/web/src/routes/_admin/subscriptions/$id.tsx`:

```tsx
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation } from "convex/react";
import { api } from "@admin-app/backend/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ArrowLeft,
  MoreVertical,
  Plus,
  Pause,
  Play,
  XCircle,
  ExternalLink,
} from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useState } from "react";
import { Id } from "@admin-app/backend/convex/_generated/dataModel";

export const Route = createFileRoute("/_admin/subscriptions/$id")({
  component: SubscriptionDetailPage,
});

function SubscriptionDetailPage() {
  const { id } = Route.useParams();
  const subscription = useQuery(api.subscriptions.subscriptions.get, {
    id: id as Id<"subscriptions">,
  });

  const pause = useMutation(api.subscriptions.subscriptions.pause);
  const resume = useMutation(api.subscriptions.subscriptions.resume);
  const cancel = useMutation(api.subscriptions.subscriptions.cancel);
  const addNote = useMutation(api.subscriptions.subscriptions.addNote);

  const [newNote, setNewNote] = useState("");

  if (subscription === undefined) {
    return <div>Loading...</div>;
  }

  if (!subscription) {
    return <div>Subscription not found</div>;
  }

  const handleAddNote = async () => {
    if (!newNote.trim()) return;
    await addNote({
      subscriptionId: id as Id<"subscriptions">,
      note: newNote,
    });
    setNewNote("");
  };

  const activeItems = subscription.items.filter((i) => i.status === "active");
  const canceledItems = subscription.items.filter((i) => i.status === "canceled");

  return (
    <div className="container py-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link to="/subscriptions/list">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">
              {subscription.subscriptionNumber}
            </h1>
            <Badge
              variant={
                subscription.status === "active" ? "default" : "secondary"
              }
            >
              {subscription.status}
            </Badge>
          </div>
        </div>
        <div className="flex gap-2">
          {subscription.status === "active" && (
            <Button
              variant="outline"
              onClick={() => pause({ subscriptionId: id as Id<"subscriptions"> })}
            >
              <Pause className="w-4 h-4 mr-2" />
              Pause
            </Button>
          )}
          {subscription.status === "paused" && (
            <Button
              variant="outline"
              onClick={() => resume({ subscriptionId: id as Id<"subscriptions"> })}
            >
              <Play className="w-4 h-4 mr-2" />
              Resume
            </Button>
          )}
          {subscription.status !== "canceled" && (
            <Button
              variant="destructive"
              onClick={() =>
                cancel({
                  subscriptionId: id as Id<"subscriptions">,
                  cancelImmediately: false,
                })
              }
            >
              <XCircle className="w-4 h-4 mr-2" />
              Cancel
            </Button>
          )}
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-3 gap-6">
        {/* Left Column - 2 cols */}
        <div className="col-span-2 space-y-6">
          {/* Customer & Subscription Info */}
          <div className="grid grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Customer</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="font-medium">
                  {subscription.customer?.firstName}{" "}
                  {subscription.customer?.lastName}
                </p>
                <p className="text-sm text-muted-foreground">
                  {subscription.customer?.email}
                </p>
                <Link
                  to="/customers/$id"
                  params={{ id: subscription.userId }}
                  className="text-sm text-primary hover:underline mt-2 inline-block"
                >
                  View Customer →
                </Link>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Subscription Info</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Monthly Total</span>
                  <span className="font-medium">
                    {formatCurrency(subscription.monthlyTotal)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Created</span>
                  <span>{formatDate(subscription.createdAt)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Next Billing</span>
                  <span>
                    {subscription.nextPaymentDate
                      ? formatDate(subscription.nextPaymentDate)
                      : "-"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Stripe</span>
                  <a
                    href={`https://dashboard.stripe.com/subscriptions/${subscription.stripeSubscriptionId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary flex items-center gap-1"
                  >
                    View <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Subscription Items */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Team Members</CardTitle>
              <Button size="sm">
                <Plus className="w-4 h-4 mr-2" />
                Add Item
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>Added</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {subscription.items.map((item) => (
                    <TableRow key={item._id}>
                      <TableCell>
                        <div className="font-medium">
                          {item.product?.name}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            item.status === "active"
                              ? "default"
                              : "secondary"
                          }
                        >
                          {item.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {item.priceOverride ? (
                          <div>
                            <span className="font-medium">
                              {formatCurrency(item.priceOverride)}
                            </span>
                            <span className="text-xs text-muted-foreground ml-1">
                              (override)
                            </span>
                          </div>
                        ) : (
                          formatCurrency(item.price)
                        )}
                      </TableCell>
                      <TableCell>{formatDate(item.addedAt)}</TableCell>
                      <TableCell>
                        {item.status === "active" && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm">
                                <MoreVertical className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent>
                              <DropdownMenuItem>Override Price</DropdownMenuItem>
                              <DropdownMenuItem className="text-red-600">
                                Cancel Item
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Invoice History */}
          <InvoiceHistory subscriptionId={id as Id<"subscriptions">} />
        </div>

        {/* Right Column - 1 col */}
        <div className="space-y-6">
          {/* Admin Actions */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Admin Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button variant="outline" className="w-full justify-start">
                Override Price
              </Button>
              <Button variant="outline" className="w-full justify-start">
                Apply Credit
              </Button>
              <Button variant="outline" className="w-full justify-start">
                Change Billing Date
              </Button>
            </CardContent>
          </Card>

          {/* Internal Notes */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Internal Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {subscription.internalNotes?.map((note, i) => (
                  <div key={i} className="text-sm">
                    <p>{note.note}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatDate(note.createdAt)}
                    </p>
                  </div>
                ))}
                <div className="pt-4 border-t">
                  <Textarea
                    placeholder="Add a note..."
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    className="mb-2"
                  />
                  <Button size="sm" onClick={handleAddNote}>
                    Add Note
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Activity History */}
          <ActivityHistory subscriptionId={id as Id<"subscriptions">} />
        </div>
      </div>
    </div>
  );
}

function InvoiceHistory({
  subscriptionId,
}: {
  subscriptionId: Id<"subscriptions">;
}) {
  const invoices = useQuery(api.subscriptions.invoices.listBySubscription, {
    subscriptionId,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Invoice History</CardTitle>
      </CardHeader>
      <CardContent>
        {invoices === undefined ? (
          <div>Loading...</div>
        ) : invoices.length === 0 ? (
          <p className="text-muted-foreground">No invoices yet</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.slice(0, 5).map((inv) => (
                <TableRow key={inv._id}>
                  <TableCell>{inv.invoiceNumber}</TableCell>
                  <TableCell>{formatDate(inv.createdAt)}</TableCell>
                  <TableCell>{formatCurrency(inv.amount)}</TableCell>
                  <TableCell>
                    <Badge
                      variant={inv.status === "paid" ? "default" : "secondary"}
                    >
                      {inv.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function ActivityHistory({
  subscriptionId,
}: {
  subscriptionId: Id<"subscriptions">;
}) {
  const history = useQuery(api.subscriptions.history.list, {
    subscriptionId,
    limit: 10,
  });

  const actionLabels: Record<string, string> = {
    created: "Subscription created",
    item_added: "Item added",
    item_canceled: "Item canceled",
    paused: "Subscription paused",
    resumed: "Subscription resumed",
    canceled: "Subscription canceled",
    payment_succeeded: "Payment succeeded",
    payment_failed: "Payment failed",
    note_added: "Note added",
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Activity History</CardTitle>
      </CardHeader>
      <CardContent>
        {history === undefined ? (
          <div>Loading...</div>
        ) : (
          <div className="space-y-3">
            {history.map((entry) => (
              <div key={entry._id} className="text-sm border-b pb-2 last:border-0">
                <p>{actionLabels[entry.action] || entry.action}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDate(entry.timestamp)} •{" "}
                  {entry.performedByType}
                </p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

---

### 5.5 Add Missing Queries

Add to `admin-app/packages/backend/convex/subscriptions/subscriptions.ts`:

```typescript
/**
 * Get recent activity across all subscriptions (admin dashboard)
 */
export const getRecentActivity = query({
  args: {},
  handler: async (ctx) => {
    await requireAdminForSubscriptions(ctx);

    const history = await ctx.db
      .query("subscription_history")
      .order("desc")
      .take(20);

    // Enrich with subscription details
    return await Promise.all(
      history.map(async (entry) => {
        const subscription = await ctx.db.get(entry.subscriptionId);
        const customer = subscription
          ? await ctx.db.get(subscription.userId)
          : null;

        return {
          ...entry,
          subscriptionNumber: subscription?.subscriptionNumber,
          customerName: customer
            ? `${customer.firstName} ${customer.lastName}`
            : null,
        };
      })
    );
  },
});

/**
 * Add internal note to subscription
 */
export const addNote = mutation({
  args: {
    subscriptionId: v.id("subscriptions"),
    note: v.string(),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdminForSubscriptions(ctx);

    const subscription = await ctx.db.get(args.subscriptionId);
    if (!subscription) throw new Error("Subscription not found");

    const now = Date.now();
    const newNote = {
      note: args.note,
      createdBy: admin._id,
      createdAt: now,
    };

    const existingNotes = subscription.internalNotes || [];

    await ctx.db.patch(args.subscriptionId, {
      internalNotes: [...existingNotes, newNote],
      updatedAt: now,
    });

    await ctx.db.insert("subscription_history", {
      subscriptionId: args.subscriptionId,
      action: "note_added",
      performedBy: admin._id,
      performedByType: "admin",
      timestamp: now,
    });

    return args.subscriptionId;
  },
});
```

Add to `admin-app/packages/backend/convex/subscriptions/history.ts`:

```typescript
import { query } from "../_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {
    subscriptionId: v.id("subscriptions"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("subscription_history")
      .withIndex("by_subscription", (q) =>
        q.eq("subscriptionId", args.subscriptionId)
      )
      .order("desc")
      .take(args.limit ?? 20);
  },
});
```

---

## Verification Checklist

After completing Phase 5:

- [ ] Dashboard shows MRR, subscription counts, status breakdown
- [ ] Recent activity feed shows subscription events
- [ ] Subscription list shows all subscriptions with filters
- [ ] Can search subscriptions by customer or number
- [ ] Subscription detail shows all info
- [ ] Can pause/resume/cancel subscription from detail
- [ ] Subscription items displayed with actions
- [ ] Invoice history shows on detail page
- [ ] Activity history timeline works
- [ ] Can add internal notes to subscriptions
- [ ] Links to Stripe dashboard work

---

## Integration Notes

### Existing Patterns Used

- Admin route structure from `/_admin`
- Data table patterns from `/admin/orders`
- Card/metric patterns from existing dashboard
- Form patterns from existing admin pages

### Reuses Existing Components

- Table, Card, Badge, Button from UI library
- Dropdown menu patterns
- Date/currency formatting utilities

---

## Files to Create/Modify

| File | Action |
|------|--------|
| `routes/_admin/subscriptions/index.tsx` | Create |
| `routes/_admin/subscriptions/list.tsx` | Create |
| `routes/_admin/subscriptions/$id.tsx` | Create |
| `convex/subscriptions/subscriptions.ts` | Add queries |
| `convex/subscriptions/history.ts` | Create |

---

**Next Phase:** [Phase 6: Checkout Integration & Polish](./06-PHASE-CHECKOUT-POLISH.md)
