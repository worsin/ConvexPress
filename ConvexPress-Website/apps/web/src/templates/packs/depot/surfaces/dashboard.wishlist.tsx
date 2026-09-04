/**
 * Depot · dashboard.wishlist — the member's wishlists as a `DataTable`
 * (expand toggle, name with the default badge, tabular item count,
 * visibility, created, share / copy link / delete) with an expanded row per
 * open list holding its items table (thumbnail, product, variant, tabular
 * price, availability, move to cart, remove). Items load lazily per expanded
 * list through the loader, as in Core.
 */
import { ChevronDown, ChevronRight, Globe, Link as LinkIcon, Lock, Package, Plus, Share2, ShoppingCart, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";

import { MediaImage } from "@/components/media/MediaImage";
import { formatMoney } from "@/lib/commerce/format";
import type { DashboardWishlistDetail, DashboardWishlistItem, DashboardWishlistSummary, DashboardWishlistSurfaceData } from "@/templates/packs/core/surfaces/dashboard.wishlist";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Badge, Button, Card, DataTable, EmptyState, Skeleton, Td, Th } from "../parts";
import { Field, Input } from "../parts/extra-plugins";
import { DashboardPageHeader, Switch, TableSkeleton, dateOrDash } from "../parts/extra-dashboard";

export default function DepotDashboardWishlist({ data }: SurfaceProps<DashboardWishlistSurfaceData>) {
  const { wishlists, currencyCode, expandedIds, detailFor, actions } = data;
  const [showCreate, setShowCreate] = useState(false);

  return (
    <div data-slot="dashboard-wishlist" data-pack="depot" className="flex flex-col gap-4">
      <DashboardPageHeader
        eyebrow="Shop"
        title="Wishlists"
        description="Save products for later and share your favorites with others."
        meta={wishlists ? `${wishlists.length} ${wishlists.length === 1 ? "list" : "lists"}` : undefined}
        aside={
          !showCreate ? (
            <Button size="sm" onClick={() => setShowCreate(true)}>
              <Plus className="size-3.5" aria-hidden="true" />
              New wishlist
            </Button>
          ) : null
        }
      />

      {showCreate ? <CreateWishlistForm onDone={() => setShowCreate(false)} onCreate={actions.create} /> : null}

      {wishlists === undefined ? (
        <TableSkeleton rows={2} />
      ) : wishlists.length === 0 ? (
        <EmptyState
          title="You don't have any wishlists yet."
          description="Add products to your wishlist while browsing the shop, or create one here."
          action={
            !showCreate ? (
              <Button variant="secondary" onClick={() => setShowCreate(true)}>
                <Plus className="size-4" aria-hidden="true" />
                Create a wishlist
              </Button>
            ) : null
          }
        />
      ) : (
        <DataTable caption="Your wishlists">
          <thead>
            <tr>
              <Th className="w-8">
                <span className="sr-only">Expand</span>
              </Th>
              <Th>Wishlist</Th>
              <Th className="text-right">Items</Th>
              <Th>Visibility</Th>
              <Th className="text-right">Created</Th>
              <Th className="text-right">
                <span className="sr-only">Actions</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {wishlists.map((wishlist) => (
              <WishlistRows key={wishlist._id} wishlist={wishlist} expanded={expandedIds.includes(wishlist._id)} detail={detailFor(wishlist._id)} currencyCode={currencyCode} actions={actions} />
            ))}
          </tbody>
        </DataTable>
      )}
    </div>
  );
}

function CreateWishlistForm({ onDone, onCreate }: { onDone: () => void; onCreate: (name: string, isPublic: boolean) => Promise<boolean> }) {
  const [name, setName] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const ok = await onCreate(name.trim(), isPublic);
      if (ok) {
        setName("");
        setIsPublic(false);
        onDone();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card as="form" onSubmit={(event: FormEvent) => void handleSubmit(event)} className="flex flex-col gap-3 p-4">
      <h2 className="text-sm font-semibold text-foreground">Create new wishlist</h2>
      <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
        <Field label="Name" htmlFor="wishlist-name">
          <Input id="wishlist-name" type="text" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Birthday ideas" />
        </Field>
        <Switch checked={isPublic} onChange={setIsPublic} label={isPublic ? "Public — anyone with the link can view" : "Private"} className="h-10" />
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={busy || !name.trim()}>
          <Plus className="size-4" aria-hidden="true" />
          {busy ? "Creating..." : "Create"}
        </Button>
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}

function WishlistRows({
  wishlist,
  expanded,
  detail,
  currencyCode,
  actions,
}: {
  wishlist: DashboardWishlistSummary;
  expanded: boolean;
  detail: DashboardWishlistDetail | null | undefined;
  currencyCode: string;
  actions: DashboardWishlistSurfaceData["actions"];
}) {
  const [busy, setBusy] = useState(false);
  const isPublic = detail?.isPublic ?? wishlist.isPublic;
  const shareToken = detail?.shareToken ?? wishlist.shareToken;
  const panelId = `wishlist-${wishlist._id}`;

  async function handleToggleShare() {
    setBusy(true);
    try {
      await actions.toggleShare(wishlist._id);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    setBusy(true);
    try {
      await actions.deleteWishlist(wishlist._id);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <tr className="border-t border-border">
        <Td>
          <button
            type="button"
            onClick={() => actions.toggleExpanded(wishlist._id)}
            aria-expanded={expanded}
            aria-controls={panelId}
            aria-label={expanded ? `Collapse ${wishlist.name}` : `Expand ${wishlist.name}`}
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {expanded ? <ChevronDown className="size-4" aria-hidden="true" /> : <ChevronRight className="size-4" aria-hidden="true" />}
          </button>
        </Td>
        <Td className="min-w-48">
          <button type="button" onClick={() => actions.toggleExpanded(wishlist._id)} className="inline-flex items-center gap-2 text-left font-semibold text-foreground hover:text-primary">
            {wishlist.name}
            {wishlist.isDefault ? <Badge tone="new">Default</Badge> : null}
          </button>
        </Td>
        <Td align="right" className="text-muted-foreground">
          {wishlist.itemCount}
        </Td>
        <Td>
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            {isPublic ? <Globe className="size-3.5 text-primary" aria-hidden="true" /> : <Lock className="size-3.5" aria-hidden="true" />}
            {isPublic ? "Public" : "Private"}
          </span>
        </Td>
        <Td align="right" className="whitespace-nowrap text-muted-foreground">
          {dateOrDash(wishlist.createdAt)}
        </Td>
        <Td align="right" className="whitespace-nowrap">
          <span className="inline-flex flex-wrap justify-end gap-1.5">
            <Button size="sm" variant="secondary" onClick={() => void handleToggleShare()} disabled={busy} aria-pressed={isPublic} className={isPublic ? "border-primary/30 bg-primary/10 text-primary hover:bg-primary/15" : undefined}>
              <Share2 className="size-3.5" aria-hidden="true" />
              {isPublic ? "Shared" : "Share"}
            </Button>
            {isPublic && shareToken ? (
              <Button size="sm" variant="secondary" onClick={() => actions.copyShareLink(shareToken)}>
                <LinkIcon className="size-3.5" aria-hidden="true" />
                Copy link
              </Button>
            ) : null}
            {!wishlist.isDefault ? (
              <Button size="sm" variant="secondary" onClick={() => void handleDelete()} disabled={busy} className="border-destructive/30 text-destructive hover:bg-destructive/10" aria-label={`Delete ${wishlist.name}`}>
                <Trash2 className="size-3.5" aria-hidden="true" />
                Delete
              </Button>
            ) : null}
          </span>
        </Td>
      </tr>

      {expanded ? (
        <tr id={panelId} className="border-t border-border bg-muted/20">
          <td colSpan={6} className="p-3">
            {detail === undefined ? (
              <div className="flex flex-col gap-2" aria-hidden="true">
                <Skeleton className="h-12" />
                <Skeleton className="h-12" />
              </div>
            ) : !detail || detail.items.length === 0 ? (
              <p className="py-4 text-center text-[13px] text-muted-foreground">No items in this wishlist yet.</p>
            ) : (
              <DataTable caption={`${wishlist.name} items`} className="bg-background">
                <thead>
                  <tr>
                    <Th>Product</Th>
                    <Th className="text-right">Price</Th>
                    <Th>Availability</Th>
                    <Th className="text-right">
                      <span className="sr-only">Actions</span>
                    </Th>
                  </tr>
                </thead>
                <tbody>
                  {detail.items.map((item) => (
                    <WishlistItemRow key={item._id} item={item} currencyCode={currencyCode} actions={actions} />
                  ))}
                </tbody>
              </DataTable>
            )}
          </td>
        </tr>
      ) : null}
    </>
  );
}

function WishlistItemRow({ item, currencyCode, actions }: { item: DashboardWishlistItem; currencyCode: string; actions: DashboardWishlistSurfaceData["actions"] }) {
  const [busy, setBusy] = useState(false);
  const product = item.product;
  if (!product) return null;

  async function handleRemove() {
    setBusy(true);
    try {
      await actions.removeItem(item._id);
    } finally {
      setBusy(false);
    }
  }

  async function handleMoveToCart() {
    setBusy(true);
    try {
      await actions.moveToCart(item._id);
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr className="border-t border-border">
      <Td className="min-w-56">
        <div className="flex items-center gap-3">
          <div className="size-12 shrink-0 overflow-hidden rounded-md bg-muted/40">
            {product.featuredMediaId ? (
              <MediaImage mediaId={product.featuredMediaId as any} alt={product.title} className="h-full w-full object-cover" preferredSize="thumbnail" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-muted-foreground/40">
                <Package className="size-5" aria-hidden="true" />
              </div>
            )}
          </div>
          <div className="min-w-0">
            <p className="line-clamp-2 font-semibold text-foreground">{product.title}</p>
            {item.variant?.name ? <p className="text-xs text-muted-foreground">{item.variant.name}</p> : null}
          </div>
        </div>
      </Td>
      <Td align="right" className="whitespace-nowrap font-semibold text-foreground">
        {formatMoney(item.effectivePrice, currencyCode)}
      </Td>
      <Td>{item.isAvailable ? <Badge tone="sale">In stock</Badge> : <Badge tone="danger">Out of stock</Badge>}</Td>
      <Td align="right" className="whitespace-nowrap">
        <span className="inline-flex gap-1.5">
          <Button size="sm" onClick={() => void handleMoveToCart()} disabled={busy || !item.isAvailable}>
            <ShoppingCart className="size-3.5" aria-hidden="true" />
            Move to cart
          </Button>
          <Button size="sm" variant="secondary" onClick={() => void handleRemove()} disabled={busy} aria-label={`Remove ${product.title}`} className="px-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
            <Trash2 className="size-3.5" aria-hidden="true" />
          </Button>
        </span>
      </Td>
    </tr>
  );
}
