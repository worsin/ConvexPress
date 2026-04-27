/**
 * ResourcePicker — select a resource (post, page, route, product, block) to
 * target with a membership restriction rule.
 *
 * For `post` / `page` / `product` types: searches the matching table via
 * admin search queries. For `route` / `block`: renders a plain text input for
 * the caller to enter the route path or block ID manually.
 */

import { useState, useMemo } from "react";
import { useQuery } from "convex-helpers/react/cache";
import { Search, FileText, FileCode, Link as LinkIcon, Box } from "lucide-react";

import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

export type ResourceType = "page" | "post" | "route" | "product" | "block";

interface ResourcePickerProps {
  resourceType: ResourceType;
  onResourceTypeChange: (type: ResourceType) => void;
  /** The selected resource's ID (for post/page/product) or the user-entered key (route/block). */
  value: string;
  onChange: (value: string, displayLabel?: string) => void;
  /** Optional human label set alongside value (e.g., post title). */
  displayLabel?: string;
  disabled?: boolean;
}

const RESOURCE_TABS: Array<{
  id: ResourceType;
  label: string;
  icon: React.ElementType;
  description: string;
}> = [
  { id: "post", label: "Post", icon: FileText, description: "Gate a blog post." },
  { id: "page", label: "Page", icon: FileText, description: "Gate a page." },
  {
    id: "product",
    label: "Product",
    icon: Box,
    description: "Gate a commerce product.",
  },
  {
    id: "route",
    label: "Route",
    icon: LinkIcon,
    description: "Gate a URL path (e.g. /premium).",
  },
  {
    id: "block",
    label: "Block",
    icon: FileCode,
    description: "Gate a reusable block by ID.",
  },
];

export function ResourcePicker({
  resourceType,
  onResourceTypeChange,
  value,
  onChange,
  displayLabel,
  disabled,
}: ResourcePickerProps) {
  return (
    <div className="space-y-4">
      {/* Resource type tabs */}
      <div
        role="tablist"
        aria-label="Resource type"
        className="flex flex-wrap gap-2"
      >
        {RESOURCE_TABS.map((tab) => {
          const Icon = tab.icon;
          const active = tab.id === resourceType;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              disabled={disabled}
              onClick={() => {
                if (disabled) return;
                onResourceTypeChange(tab.id);
                onChange("", "");
              }}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors",
                active
                  ? "border-primary/40 bg-primary/10 text-foreground"
                  : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
                disabled && "cursor-not-allowed opacity-60",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Type-specific pickers */}
      {resourceType === "post" && (
        <ContentSearch
          contentType="post"
          value={value}
          displayLabel={displayLabel}
          onChange={onChange}
          disabled={disabled}
        />
      )}
      {resourceType === "page" && (
        <ContentSearch
          contentType="page"
          value={value}
          displayLabel={displayLabel}
          onChange={onChange}
          disabled={disabled}
        />
      )}
      {resourceType === "product" && (
        <ProductSearch
          value={value}
          displayLabel={displayLabel}
          onChange={onChange}
          disabled={disabled}
        />
      )}
      {resourceType === "route" && (
        <FreeformKeyInput
          value={value}
          onChange={(next) => onChange(next, next)}
          placeholder="/premium-content"
          helperText="Enter a URL path, starting with /. Example: /members-only"
          disabled={disabled}
        />
      )}
      {resourceType === "block" && (
        <FreeformKeyInput
          value={value}
          onChange={(next) => onChange(next, next)}
          placeholder="reusable-block-id"
          helperText="Enter a reusable block ID (Convex ID)."
          disabled={disabled}
        />
      )}
    </div>
  );
}

// ─── Content Search (post + page) ─────────────────────────────────────────

function ContentSearch({
  contentType,
  value,
  displayLabel,
  onChange,
  disabled,
}: {
  contentType: "post" | "page";
  value: string;
  displayLabel?: string;
  onChange: (value: string, displayLabel?: string) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");

  // Fetch using the post admin list with search (works for both post + page via `type`)
  const result = useQuery(
    (api as any).posts.queries.list,
    {
      type: contentType,
      search: query.trim() || undefined,
      perPage: 15,
      page: 1,
    },
  ) as
    | {
        posts: Array<{
          _id: Id<"posts">;
          title: string;
          slug: string;
          status: string;
        }>;
      }
    | undefined;

  const hasSelection = value.length > 0;

  return (
    <div className="space-y-2">
      {hasSelection && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-primary/40 bg-primary/5 px-3.5 py-2.5">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">
              {displayLabel ?? value}
            </p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {contentType === "post" ? "Post" : "Page"} selected
            </p>
          </div>
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              onChange("", "");
              setQuery("");
            }}
            className="shrink-0 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            Change
          </button>
        </div>
      )}

      {!hasSelection && (
        <>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${contentType}s...`}
              disabled={disabled}
              className="pl-9"
            />
          </div>

          <div className="max-h-72 overflow-y-auto rounded-xl border border-border bg-card">
            {result === undefined ? (
              <div className="space-y-1.5 p-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-10 animate-pulse rounded-lg bg-muted"
                  />
                ))}
              </div>
            ) : result.posts.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-muted-foreground">
                No {contentType}s found.
              </div>
            ) : (
              <ul className="divide-y divide-border/70">
                {result.posts.map((item) => (
                  <li key={item._id}>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => onChange(item._id, item.title)}
                      className="flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left text-sm transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate font-medium text-foreground">
                          {item.title || "(no title)"}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">
                          /{item.slug}
                        </span>
                      </span>
                      <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                        {item.status}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Product Search ───────────────────────────────────────────────────────

function ProductSearch({
  value,
  displayLabel,
  onChange,
  disabled,
}: {
  value: string;
  displayLabel?: string;
  onChange: (value: string, displayLabel?: string) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");

  const allProducts = useQuery(
    (api as any)["commerce/products"].list,
    {},
  ) as
    | Array<{
        _id: Id<"commerce_products">;
        title?: string;
        slug?: string;
        status?: string;
      }>
    | null
    | undefined;

  const filtered = useMemo(() => {
    if (!allProducts) return undefined;
    const q = query.trim().toLowerCase();
    if (!q) return allProducts.slice(0, 15);
    return allProducts
      .filter(
        (p) =>
          (p.title ?? "").toLowerCase().includes(q) ||
          (p.slug ?? "").toLowerCase().includes(q),
      )
      .slice(0, 15);
  }, [allProducts, query]);

  const hasSelection = value.length > 0;

  return (
    <div className="space-y-2">
      {hasSelection && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-primary/40 bg-primary/5 px-3.5 py-2.5">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">
              {displayLabel ?? value}
            </p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              Product selected
            </p>
          </div>
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              onChange("", "");
              setQuery("");
            }}
            className="shrink-0 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            Change
          </button>
        </div>
      )}

      {!hasSelection && (
        <>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search products..."
              disabled={disabled}
              className="pl-9"
            />
          </div>

          <div className="max-h-72 overflow-y-auto rounded-xl border border-border bg-card">
            {filtered === undefined ? (
              <div className="space-y-1.5 p-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-10 animate-pulse rounded-lg bg-muted"
                  />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-muted-foreground">
                No products found.
              </div>
            ) : (
              <ul className="divide-y divide-border/70">
                {filtered.map((item) => (
                  <li key={item._id}>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() =>
                        onChange(item._id, item.title ?? "(no title)")
                      }
                      className="flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left text-sm transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate font-medium text-foreground">
                          {item.title || "(no title)"}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">
                          /{item.slug ?? ""}
                        </span>
                      </span>
                      {item.status && (
                        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                          {item.status}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Freeform key (route + block) ─────────────────────────────────────────

function FreeformKeyInput({
  value,
  onChange,
  placeholder,
  helperText,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  helperText?: string;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="font-mono"
      />
      {helperText && (
        <p className="text-xs text-muted-foreground">{helperText}</p>
      )}
    </div>
  );
}
