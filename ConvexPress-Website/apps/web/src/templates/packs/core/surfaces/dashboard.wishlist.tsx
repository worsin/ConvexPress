/**
 * Core · dashboard.wishlist — the member's wishlists: create, expand to see
 * items (loaded lazily by the loader per expanded list), share / copy link,
 * delete, move items to the cart or remove them.
 */
import { useState } from "react";
import {
  Heart,
  Plus,
  Trash2,
  ShoppingCart,
  Share2,
  Link as LinkIcon,
  ChevronDown,
  ChevronRight,
  Lock,
  Globe,
  Package,
} from "lucide-react";

import { MediaImage } from "@/components/media/MediaImage";
import type { SurfaceProps } from "@/templates/sdk/types";

export interface DashboardWishlistSummary {
  _id: string;
  name: string;
  isPublic: boolean;
  isDefault: boolean;
  shareToken?: string;
  itemCount: number;
  createdAt: number;
}

export interface DashboardWishlistItem {
  _id: string;
  productId: string;
  variantId?: string;
  effectivePrice: number;
  isAvailable: boolean;
  product: {
    _id: string;
    title: string;
    slug?: string;
    featuredMediaId?: string;
    status: string;
  } | null;
  variant?: {
    _id: string;
    name?: string;
  } | null;
}

export interface DashboardWishlistDetail {
  _id: string;
  name: string;
  isPublic: boolean;
  shareToken?: string;
  items: DashboardWishlistItem[];
}

export interface DashboardWishlistSurfaceData {
  /** undefined while loading. */
  wishlists: DashboardWishlistSummary[] | undefined;
  currencyCode: string;
  /** Ids of the wishlists whose items are subscribed to (expanded). */
  expandedIds: string[];
  /** Detail for an expanded wishlist: undefined while loading, null when unknown. */
  detailFor: (wishlistId: string) => DashboardWishlistDetail | null | undefined;
  actions: {
    toggleExpanded: (wishlistId: string) => void;
    /** Validates the name, creates and toasts; resolves true on success. */
    create: (name: string, isPublic: boolean) => Promise<boolean>;
    removeItem: (itemId: string) => Promise<void>;
    moveToCart: (itemId: string) => Promise<void>;
    toggleShare: (wishlistId: string) => Promise<void>;
    /** Confirms, deletes and toasts. */
    deleteWishlist: (wishlistId: string) => Promise<void>;
    /** Copies the public share link for the token and toasts. */
    copyShareLink: (shareToken: string) => void;
  };
}

// ---- Formatters ----

function formatMoney(amount: number, currencyCode = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode,
  }).format(amount / 100);
}

// ---- Create Wishlist Form ----

function CreateWishlistForm({
  onDone,
  onCreate,
}: {
  onDone: () => void;
  onCreate: (name: string, isPublic: boolean) => Promise<boolean>;
}) {
  const [name, setName] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
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
    <form
      onSubmit={(e) => void handleSubmit(e)}
      className="rounded-2xl border border-border bg-card p-5 shadow-sm"
    >
      <h3 className="text-sm font-semibold text-foreground">
        Create New Wishlist
      </h3>
      <div className="mt-4 space-y-4">
        <div>
          <label className="block text-xs font-medium text-muted-foreground">
            Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Birthday Ideas"
            className="mt-1 w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm"
          />
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setIsPublic(!isPublic)}
            className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors ${
              isPublic ? "bg-primary" : "bg-muted"
            }`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 rounded-full bg-primary-foreground shadow transition-transform ${
                isPublic ? "translate-x-[18px]" : "translate-x-[3px]"
              }`}
            />
          </button>
          <span className="text-xs text-muted-foreground">
            {isPublic ? "Public — anyone with the link can view" : "Private"}
          </span>
        </div>
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={busy || !name.trim()}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            {busy ? "Creating..." : "Create"}
          </button>
          <button
            type="button"
            onClick={onDone}
            className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            Cancel
          </button>
        </div>
      </div>
    </form>
  );
}

// ---- Wishlist Item Row ----

function WishlistItemRow({
  item,
  currencyCode,
  actions,
}: {
  item: DashboardWishlistItem;
  currencyCode: string;
  actions: DashboardWishlistSurfaceData["actions"];
}) {
  const [busy, setBusy] = useState(false);

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

  const product = item.product;
  if (!product) return null;

  return (
    <div className="flex items-center gap-4 border-b border-border py-3 last:border-b-0">
      {/* Product image */}
      <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-xl bg-muted">
        {product.featuredMediaId ? (
          <MediaImage
            mediaId={product.featuredMediaId as any}
            alt={product.title}
            className="h-full w-full object-cover"
            preferredSize="thumbnail"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Package className="h-5 w-5 text-muted-foreground/40" />
          </div>
        )}
      </div>

      {/* Product info */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">
          {product.title}
        </p>
        {item.variant?.name && (
          <p className="text-xs text-muted-foreground">{item.variant.name}</p>
        )}
        <p className="mt-0.5 text-sm font-medium text-foreground">
          {formatMoney(item.effectivePrice, currencyCode)}
        </p>
        {!item.isAvailable && (
          <p className="mt-0.5 text-xs text-destructive">Out of stock</p>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={() => void handleMoveToCart()}
          disabled={busy || !item.isAvailable}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ShoppingCart className="h-3.5 w-3.5" />
          Move to Cart
        </button>
        <button
          type="button"
          onClick={() => void handleRemove()}
          disabled={busy}
          className="rounded-lg border border-border p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

// ---- Wishlist Card ----

function WishlistCard({
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

  const isPublic = detail?.isPublic ?? wishlist.isPublic;
  const shareToken = detail?.shareToken ?? wishlist.shareToken;

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      {/* Header */}
      <button
        type="button"
        onClick={() => actions.toggleExpanded(wishlist._id)}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-muted/30"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Heart className="h-4 w-4 flex-shrink-0 text-destructive" />
            <h3 className="truncate text-sm font-semibold text-foreground">
              {wishlist.name}
            </h3>
            {wishlist.isDefault && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                Default
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {wishlist.itemCount} item{wishlist.itemCount === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isPublic ? (
            <Globe className="h-3.5 w-3.5 text-primary" />
          ) : (
            <Lock className="h-3.5 w-3.5 text-muted-foreground" />
          )}
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-border">
          {/* Action bar */}
          <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-3">
            <button
              type="button"
              onClick={() => void handleToggleShare()}
              disabled={busy}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
                isPublic
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:bg-muted"
              }`}
            >
              <Share2 className="h-3.5 w-3.5" />
              {isPublic ? "Shared" : "Share"}
            </button>

            {isPublic && shareToken && (
              <button
                type="button"
                onClick={() => actions.copyShareLink(shareToken)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <LinkIcon className="h-3.5 w-3.5" />
                Copy Link
              </button>
            )}

            <div className="flex-1" />

            {!wishlist.isDefault && (
              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/30 px-3 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </button>
            )}
          </div>

          {/* Items list */}
          <div className="px-5 py-3">
            {detail === undefined ? (
              <div className="space-y-3">
                {Array.from({ length: 2 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-14 animate-pulse rounded-xl bg-muted"
                  />
                ))}
              </div>
            ) : !detail || detail.items.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                No items in this wishlist yet.
              </div>
            ) : (
              <div>
                {detail.items.map((item) => (
                  <WishlistItemRow
                    key={item._id}
                    item={item}
                    currencyCode={currencyCode}
                    actions={actions}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Main ----

export default function CoreDashboardWishlist({ data }: SurfaceProps<DashboardWishlistSurfaceData>) {
  const { wishlists, currencyCode, expandedIds, detailFor, actions } = data;
  const [showCreate, setShowCreate] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-sm font-medium text-foreground">Wishlists</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Save products for later and share your favorites with others.
          </p>
        </div>
        {!showCreate && (
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            New Wishlist
          </button>
        )}
      </div>

      {showCreate && (
        <CreateWishlistForm onDone={() => setShowCreate(false)} onCreate={actions.create} />
      )}

      {wishlists === undefined ? (
        <div className="space-y-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-2xl bg-muted"
            />
          ))}
        </div>
      ) : wishlists.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center">
          <Heart className="mx-auto h-10 w-10 text-muted-foreground/40" />
          <p className="mt-3 text-sm text-muted-foreground">
            You don't have any wishlists yet. Add products to your wishlist
            while browsing the shop, or create one above.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {wishlists.map((wl) => (
            <WishlistCard
              key={wl._id}
              wishlist={wl}
              expanded={expandedIds.includes(wl._id)}
              detail={detailFor(wl._id)}
              currencyCode={currencyCode}
              actions={actions}
            />
          ))}
        </div>
      )}
    </div>
  );
}
