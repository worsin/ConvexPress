# Phase 4: Customer Portal (My Team)

> **Duration:** 2-3 days
> **Prerequisites:** Phase 3 (Core Mutations)
> **Can Parallel With:** Phase 5 (Admin Dashboard)

---

## Objective

Build the customer-facing subscription management interface. This is called "My Team" to align with Virtual Overseer's virtual employee branding.

---

## Tasks

### 4.1 Create Route Structure

Create the following routes in `website-app/apps/web/src/routes/`:

```
_dashboard/
├── subscriptions/
│   ├── index.tsx           # My Team overview (main page)
│   ├── $id.tsx             # Subscription detail
│   ├── $id.invoices.tsx    # Invoice history
│   ├── $id.add.tsx         # Add team member
│   └── $id.payment.tsx     # Update payment method
```

---

### 4.2 My Team Page (Main Subscription View)

Create `website-app/apps/web/src/routes/_dashboard/subscriptions/index.tsx`:

```tsx
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "@website-app/backend/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, CreditCard, Calendar, FileText } from "lucide-react";
import { TeamMemberCard } from "@/components/subscriptions/team-member-card";
import { formatCurrency, formatDate } from "@/lib/utils";

export const Route = createFileRoute("/_dashboard/subscriptions/")({
  component: MyTeamPage,
});

function MyTeamPage() {
  const subscription = useQuery(api.subscriptions.subscriptions.getMySubscription, {});

  if (subscription === undefined) {
    return <LoadingSkeleton />;
  }

  if (!subscription) {
    return <NoSubscription />;
  }

  const activeItems = subscription.items.filter((i) => i.status === "active");
  const pendingCancellation = subscription.items.filter(
    (i) => i.status === "pending_cancellation"
  );

  return (
    <div className="container py-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">My Team</h1>
          <p className="text-muted-foreground mt-1">
            Manage your virtual employees
          </p>
        </div>
        <div className="text-right">
          <div className="text-3xl font-bold">
            {formatCurrency(subscription.monthlyTotal)}
            <span className="text-lg font-normal text-muted-foreground">/mo</span>
          </div>
        </div>
      </div>

      {/* Billing Summary Card */}
      <Card className="mb-8">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm">
                  Next billing: {formatDate(subscription.nextPaymentDate)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm">
                  Visa ending 4242
                  {/* TODO: Get actual payment method */}
                </span>
              </div>
            </div>
            <div className="flex gap-2">
              <Link to="/subscriptions/$id/payment" params={{ id: subscription._id }}>
                <Button variant="outline" size="sm">
                  Update Payment
                </Button>
              </Link>
              <Link to="/subscriptions/$id/invoices" params={{ id: subscription._id }}>
                <Button variant="outline" size="sm">
                  <FileText className="w-4 h-4 mr-2" />
                  View Invoices
                </Button>
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Status Badge */}
      {subscription.status !== "active" && (
        <div className="mb-6">
          <StatusBanner status={subscription.status} />
        </div>
      )}

      {/* Pending Cancellation Notice */}
      {pendingCancellation.length > 0 && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-amber-800">
            {pendingCancellation.length} team member(s) will be removed at the end
            of your billing period.
          </p>
        </div>
      )}

      {/* Team Members Grid */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Team Members</h2>
          <Link to="/subscriptions/$id/add" params={{ id: subscription._id }}>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Add Team Member
            </Button>
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {subscription.items.map((item) => (
            <TeamMemberCard
              key={item._id}
              item={item}
              subscriptionId={subscription._id}
            />
          ))}
        </div>
      </div>

      {/* Recent Invoices */}
      <RecentInvoices subscriptionId={subscription._id} />

      {/* Subscription Actions */}
      <div className="mt-8 pt-8 border-t">
        <h3 className="text-lg font-medium mb-4">Subscription Actions</h3>
        <div className="flex gap-4">
          {subscription.template?.allowPause && subscription.status === "active" && (
            <Button variant="outline">Pause Subscription</Button>
          )}
          {subscription.status === "paused" && (
            <Button variant="outline">Resume Subscription</Button>
          )}
          <Button variant="destructive" className="ml-auto">
            Cancel Subscription
          </Button>
        </div>
      </div>
    </div>
  );
}

function NoSubscription() {
  return (
    <div className="container py-12 text-center">
      <h1 className="text-2xl font-bold mb-4">No Active Subscription</h1>
      <p className="text-muted-foreground mb-8">
        You don't have any active subscriptions. Browse our virtual employees to
        get started.
      </p>
      <Link to="/products">
        <Button size="lg">Browse Virtual Employees</Button>
      </Link>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="container py-6 max-w-5xl">
      <div className="h-8 w-48 bg-muted rounded mb-8" />
      <div className="grid grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-48 bg-muted rounded" />
        ))}
      </div>
    </div>
  );
}

function StatusBanner({ status }: { status: string }) {
  const statusConfig: Record<string, { bg: string; text: string; message: string }> = {
    paused: {
      bg: "bg-blue-50 border-blue-200",
      text: "text-blue-800",
      message: "Your subscription is paused. Resume to continue services.",
    },
    past_due: {
      bg: "bg-red-50 border-red-200",
      text: "text-red-800",
      message: "Payment failed. Please update your payment method.",
    },
    trialing: {
      bg: "bg-green-50 border-green-200",
      text: "text-green-800",
      message: "You're in your free trial period.",
    },
  };

  const config = statusConfig[status];
  if (!config) return null;

  return (
    <div className={`p-4 border rounded-lg ${config.bg}`}>
      <p className={config.text}>{config.message}</p>
    </div>
  );
}
```

---

### 4.3 Team Member Card Component

Create `website-app/apps/web/src/components/subscriptions/team-member-card.tsx`:

```tsx
import { useMutation } from "convex/react";
import { api } from "@website-app/backend/convex/_generated/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreVertical, UserCircle } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useState } from "react";
import { CancelItemDialog } from "./cancel-item-dialog";

interface TeamMemberCardProps {
  item: {
    _id: string;
    status: string;
    price: number;
    priceOverride?: number;
    addedAt: number;
    product?: {
      name: string;
      description?: string;
      imageUrl?: string;
    };
  };
  subscriptionId: string;
}

export function TeamMemberCard({ item, subscriptionId }: TeamMemberCardProps) {
  const [showCancelDialog, setShowCancelDialog] = useState(false);

  const effectivePrice = item.priceOverride ?? item.price;
  const isCanceled = item.status === "canceled";
  const isPendingCancel = item.status === "pending_cancellation";

  return (
    <>
      <Card className={isCanceled ? "opacity-60" : ""}>
        <CardContent className="pt-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              {item.product?.imageUrl ? (
                <img
                  src={item.product.imageUrl}
                  alt={item.product.name}
                  className="w-12 h-12 rounded-full object-cover"
                />
              ) : (
                <UserCircle className="w-12 h-12 text-muted-foreground" />
              )}
              <div>
                <h3 className="font-semibold">{item.product?.name}</h3>
                <p className="text-sm text-muted-foreground">
                  {item.product?.description?.slice(0, 50)}
                </p>
              </div>
            </div>

            {!isCanceled && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setShowCancelDialog(true)}>
                    Cancel Team Member
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          <div className="flex items-center justify-between">
            <div className="text-lg font-bold">
              {formatCurrency(effectivePrice)}
              <span className="text-sm font-normal text-muted-foreground">/mo</span>
            </div>
            <Badge
              variant={
                isCanceled
                  ? "secondary"
                  : isPendingCancel
                  ? "outline"
                  : "default"
              }
            >
              {isCanceled
                ? "Canceled"
                : isPendingCancel
                ? "Canceling"
                : "Active"}
            </Badge>
          </div>
        </CardContent>
      </Card>

      <CancelItemDialog
        open={showCancelDialog}
        onOpenChange={setShowCancelDialog}
        itemId={item._id}
        productName={item.product?.name || "Team Member"}
      />
    </>
  );
}
```

---

### 4.4 Cancel Item Dialog

Create `website-app/apps/web/src/components/subscriptions/cancel-item-dialog.tsx`:

```tsx
import { useMutation } from "convex/react";
import { api } from "@website-app/backend/convex/_generated/api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { Id } from "@website-app/backend/convex/_generated/dataModel";

interface CancelItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemId: string;
  productName: string;
}

export function CancelItemDialog({
  open,
  onOpenChange,
  itemId,
  productName,
}: CancelItemDialogProps) {
  const cancelItem = useMutation(api.subscriptions.items.cancelItem);
  const [isLoading, setIsLoading] = useState(false);

  const handleCancel = async () => {
    setIsLoading(true);
    try {
      await cancelItem({
        itemId: itemId as Id<"subscription_items">,
        cancelImmediately: false, // Cancel at period end by default
      });
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to cancel item:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel {productName}?</DialogTitle>
          <DialogDescription>
            This team member will continue working until the end of your current
            billing period. After that, they will be removed from your team.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <p className="text-sm text-muted-foreground">
            You can add them back at any time by clicking "Add Team Member".
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Keep Team Member
          </Button>
          <Button
            variant="destructive"
            onClick={handleCancel}
            disabled={isLoading}
          >
            {isLoading ? "Canceling..." : "Cancel at Period End"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

---

### 4.5 Add Team Member Page

Create `website-app/apps/web/src/routes/_dashboard/subscriptions/$id.add.tsx`:

```tsx
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation } from "convex/react";
import { api } from "@website-app/backend/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Plus, Check } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useState } from "react";
import { Id } from "@website-app/backend/convex/_generated/dataModel";

export const Route = createFileRoute("/_dashboard/subscriptions/$id/add")({
  component: AddTeamMemberPage,
});

function AddTeamMemberPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();

  // Get subscription to check what's already added
  const subscription = useQuery(api.subscriptions.subscriptions.get, {
    id: id as Id<"subscriptions">,
  });

  // Get available subscription products
  const products = useQuery(api.products.listSubscriptionProducts, {});

  const addItem = useMutation(api.subscriptions.items.addItem);
  const [addingProductId, setAddingProductId] = useState<string | null>(null);

  if (subscription === undefined || products === undefined) {
    return <div>Loading...</div>;
  }

  const existingProductIds = new Set(
    subscription?.items
      .filter((i) => i.status === "active")
      .map((i) => i.productId)
  );

  const handleAddProduct = async (productId: string) => {
    setAddingProductId(productId);
    try {
      await addItem({
        subscriptionId: id as Id<"subscriptions">,
        productId: productId as Id<"products">,
      });
      // Redirect back to subscription page
      navigate({ to: "/subscriptions" });
    } catch (error) {
      console.error("Failed to add item:", error);
      setAddingProductId(null);
    }
  };

  // Calculate proration (simplified)
  const calculateProration = (price: number) => {
    if (!subscription) return 0;
    const now = Date.now();
    const periodEnd = subscription.currentPeriodEnd;
    const periodStart = subscription.currentPeriodStart;
    const totalDays = (periodEnd - periodStart) / (1000 * 60 * 60 * 24);
    const remainingDays = (periodEnd - now) / (1000 * 60 * 60 * 24);
    return Math.round((price * remainingDays) / totalDays);
  };

  return (
    <div className="container py-6 max-w-4xl">
      <div className="mb-8">
        <Link to="/subscriptions">
          <Button variant="ghost" className="mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to My Team
          </Button>
        </Link>
        <h1 className="text-2xl font-bold">Add Team Member</h1>
        <p className="text-muted-foreground">
          Choose a virtual employee to add to your team
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {products?.map((product) => {
          const isAlreadyAdded = existingProductIds.has(product._id);
          const price =
            product.subscriptionOverrides?.customPrice ?? product.basePrice ?? 0;
          const proratedAmount = calculateProration(price);

          return (
            <Card key={product._id} className={isAlreadyAdded ? "opacity-60" : ""}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    {product.imageUrl ? (
                      <img
                        src={product.imageUrl}
                        alt={product.name}
                        className="w-16 h-16 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-16 h-16 bg-muted rounded-full" />
                    )}
                    <div>
                      <CardTitle className="text-lg">{product.name}</CardTitle>
                      <p className="text-sm text-muted-foreground">
                        {product.shortDescription}
                      </p>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-2xl font-bold">
                      {formatCurrency(price)}
                      <span className="text-sm font-normal text-muted-foreground">
                        /mo
                      </span>
                    </div>
                    {!isAlreadyAdded && proratedAmount > 0 && (
                      <p className="text-sm text-muted-foreground">
                        {formatCurrency(proratedAmount)} prorated today
                      </p>
                    )}
                  </div>

                  {isAlreadyAdded ? (
                    <Button variant="outline" disabled>
                      <Check className="w-4 h-4 mr-2" />
                      Already Added
                    </Button>
                  ) : (
                    <Button
                      onClick={() => handleAddProduct(product._id)}
                      disabled={addingProductId === product._id}
                    >
                      {addingProductId === product._id ? (
                        "Adding..."
                      ) : (
                        <>
                          <Plus className="w-4 h-4 mr-2" />
                          Add to Team
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
```

---

### 4.6 Invoice History Page

Create `website-app/apps/web/src/routes/_dashboard/subscriptions/$id.invoices.tsx`:

```tsx
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "@website-app/backend/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowLeft, Download, ExternalLink } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Id } from "@website-app/backend/convex/_generated/dataModel";

export const Route = createFileRoute("/_dashboard/subscriptions/$id/invoices")({
  component: InvoicesPage,
});

function InvoicesPage() {
  const { id } = Route.useParams();

  const invoices = useQuery(api.subscriptions.invoices.listBySubscription, {
    subscriptionId: id as Id<"subscriptions">,
  });

  if (invoices === undefined) {
    return <div>Loading...</div>;
  }

  return (
    <div className="container py-6 max-w-4xl">
      <div className="mb-8">
        <Link to="/subscriptions">
          <Button variant="ghost" className="mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to My Team
          </Button>
        </Link>
        <h1 className="text-2xl font-bold">Invoice History</h1>
        <p className="text-muted-foreground">
          View and download your past invoices
        </p>
      </div>

      {invoices.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No invoices yet</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices.map((invoice) => (
              <TableRow key={invoice._id}>
                <TableCell className="font-medium">
                  {invoice.invoiceNumber}
                </TableCell>
                <TableCell>{formatDate(invoice.createdAt)}</TableCell>
                <TableCell>{formatCurrency(invoice.amount)}</TableCell>
                <TableCell>
                  <Badge
                    variant={
                      invoice.status === "paid"
                        ? "default"
                        : invoice.status === "open"
                        ? "outline"
                        : "secondary"
                    }
                  >
                    {invoice.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    {invoice.invoicePdfUrl && (
                      <a
                        href={invoice.invoicePdfUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Button variant="ghost" size="sm">
                          <Download className="w-4 h-4" />
                        </Button>
                      </a>
                    )}
                    {invoice.hostedInvoiceUrl && (
                      <a
                        href={invoice.hostedInvoiceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Button variant="ghost" size="sm">
                          <ExternalLink className="w-4 h-4" />
                        </Button>
                      </a>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
```

---

### 4.7 Invoice Query

Add to `admin-app/packages/backend/convex/subscriptions/invoices.ts`:

```typescript
import { query } from "../_generated/server";
import { v } from "convex/values";
import { getCurrentUser } from "./helpers";

export const listBySubscription = query({
  args: { subscriptionId: v.id("subscriptions") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const subscription = await ctx.db.get(args.subscriptionId);
    if (!subscription) throw new Error("Subscription not found");

    // Check ownership
    if (subscription.userId !== user._id && !user.isInternal) {
      throw new Error("Not authorized");
    }

    return await ctx.db
      .query("subscription_invoices")
      .withIndex("by_subscription", (q) =>
        q.eq("subscriptionId", args.subscriptionId)
      )
      .order("desc")
      .collect();
  },
});
```

---

### 4.8 Product Query for Subscription Products

Add to `admin-app/packages/backend/convex/products.ts`:

```typescript
/**
 * List products that are subscription-enabled
 */
export const listSubscriptionProducts = query({
  args: {},
  handler: async (ctx) => {
    const products = await ctx.db
      .query("products")
      .filter((q) =>
        q.and(
          q.eq(q.field("isSubscriptionEnabled"), true),
          q.eq(q.field("status"), "active")
        )
      )
      .collect();

    return products;
  },
});
```

---

## Verification Checklist

After completing Phase 4:

- [ ] My Team page shows subscription with all items
- [ ] Team member cards display correctly
- [ ] Can cancel individual team members
- [ ] Cancel dialog confirms action and explains behavior
- [ ] Add Team Member page lists available products
- [ ] Can add new product to subscription
- [ ] Invoice history page shows all invoices
- [ ] Can download/view invoices from Stripe
- [ ] Subscription status banner shows for non-active states
- [ ] Empty state shows when no subscription

---

## Integration Notes

### Existing Patterns Used

- Dashboard layout from `/_dashboard`
- Card, Button, Badge components already exist
- Data table patterns from existing order history

### Routes Follow Existing Structure

- Nested under `/_dashboard` for authenticated users
- Uses existing auth guards from layout

### Convex React Hooks

- `useQuery` for reactive data
- `useMutation` for actions
- Same patterns as existing checkout flow

---

## Files to Create/Modify

| File | Action |
|------|--------|
| `routes/_dashboard/subscriptions/index.tsx` | Create |
| `routes/_dashboard/subscriptions/$id.tsx` | Create |
| `routes/_dashboard/subscriptions/$id.add.tsx` | Create |
| `routes/_dashboard/subscriptions/$id.invoices.tsx` | Create |
| `routes/_dashboard/subscriptions/$id.payment.tsx` | Create |
| `components/subscriptions/team-member-card.tsx` | Create |
| `components/subscriptions/cancel-item-dialog.tsx` | Create |
| `convex/subscriptions/invoices.ts` | Create |
| `convex/products.ts` | Modify (add listSubscriptionProducts) |

---

**Next Phase:** [Phase 5: Admin Dashboard](./05-PHASE-ADMIN-DASHBOARD.md)
