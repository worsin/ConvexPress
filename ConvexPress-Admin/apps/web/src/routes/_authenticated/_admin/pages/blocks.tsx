import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import { CheckCircle2, LayoutGrid, Search, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";

import { api } from "@backend/convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
  BLOCK_CATEGORY_ORDER,
  getAllBlockDefinitions,
  getBlockSource,
} from "@/lib/blocks/registry";
import type { AdminBlockDefinition } from "@/lib/blocks/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/_admin/pages/blocks")({
  component: BlocksManagementPage,
});

type BlockSettings = {
  disabledBlockNames?: string[];
};

function BlocksManagementPage() {
  const blockSettings = useQuery(api.settings.queries.getBySection, {
    section: "blocks" as any,
  }) as BlockSettings | null | undefined;
  const usageSummary = useQuery((api as any).blocks.queries.usageSummary, {}) as
    | Array<{ name: string; count: number }>
    | undefined;
  const updateSettings = useMutation(api.settings.mutations.updateSection);

  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [activeSource, setActiveSource] = useState<string>("all");
  const [savingName, setSavingName] = useState<string | null>(null);
  const [usageBlockName, setUsageBlockName] = useState<string | null>(null);
  const usageDetail = useQuery(
    (api as any).blocks.queries.usageByBlockName,
    usageBlockName ? { name: usageBlockName, limit: 20 } : "skip",
  ) as
    | {
        name: string;
        count: number;
        publishedCount: number;
        recent: Array<{
          _id: string;
          title: string;
          slug: string;
          type: "page" | "post";
          status: string;
          updatedAt?: number;
        }>;
      }
    | undefined;

  const definitions = getAllBlockDefinitions();
  const disabledBlockNames = blockSettings?.disabledBlockNames ?? [];
  const disabledSet = useMemo(
    () => new Set(disabledBlockNames.map(String)),
    [disabledBlockNames],
  );
  const usageByName = useMemo(
    () => new Map((usageSummary ?? []).map((item) => [item.name, item.count])),
    [usageSummary],
  );

  const categories = useMemo(
    () =>
      BLOCK_CATEGORY_ORDER.map((category) => ({
        ...category,
        count: definitions.filter((definition) => definition.category === category.key).length,
      })).filter((category) => category.count > 0),
    [definitions],
  );

  const sources = useMemo(() => {
    const counts = new Map<string, number>();
    for (const definition of definitions) {
      const source = getBlockSource(definition.name);
      counts.set(source, (counts.get(source) ?? 0) + 1);
    }
    return Array.from(counts.entries()).map(([source, count]) => ({ source, count }));
  }, [definitions]);

  const filteredBlocks = useMemo(() => {
    const q = query.trim().toLowerCase();
    return definitions.filter((definition) => {
      if (activeCategory !== "all" && definition.category !== activeCategory) {
        return false;
      }
      if (activeSource !== "all" && getBlockSource(definition.name) !== activeSource) {
        return false;
      }
      if (!q) return true;
      const haystack = [
        definition.title,
        definition.description,
        definition.name,
        definition.category,
        ...(definition.keywords ?? []),
      ].join(" ").toLowerCase();
      return haystack.includes(q);
    });
  }, [activeCategory, activeSource, definitions, query]);

  const updateDisabledBlocks = async (
    nextDisabledBlockNames: string[],
    savingBlockName?: string,
  ) => {
    setSavingName(savingBlockName ?? "__all__");
    try {
      await updateSettings({
        section: "blocks" as any,
        values: { disabledBlockNames: nextDisabledBlockNames },
      });
      toast.success("Block settings saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save block settings.");
    } finally {
      setSavingName(null);
    }
  };

  const toggleBlock = async (definition: AdminBlockDefinition<Record<string, unknown>>) => {
    const name = String(definition.name);
    const usageCount = usageByName.get(name) ?? 0;
    if (!disabledSet.has(name) && usageCount > 0) {
      const confirmed = confirm(
        `${definition.title} is used on ${usageCount} document${usageCount === 1 ? "" : "s"}. Disabling it will hide it from new insertion and AI generation, but existing content will remain. Continue?`,
      );
      if (!confirmed) return;
    }
    const next = disabledSet.has(name)
      ? disabledBlockNames.filter((disabledName) => disabledName !== name)
      : [...disabledBlockNames, name];
    await updateDisabledBlocks(next, name);
  };

  const disabledRegisteredCount = definitions.filter((definition) =>
    disabledSet.has(String(definition.name)),
  ).length;
  const enabledCount = definitions.length - disabledRegisteredCount;
  const isLoading = blockSettings === undefined;

  return (
    <div className="w-full space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
            <LayoutGrid className="size-4" />
            Pages
          </div>
          <h1 className="text-2xl font-semibold text-foreground">Blocks</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Manage the registered page blocks available to page editors and AI
            generation. Disabled blocks remain readable on existing pages.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={isLoading || disabledBlockNames.length === 0 || savingName !== null}
          onClick={() => void updateDisabledBlocks([])}
          className="gap-1.5"
        >
          <CheckCircle2 className="size-4" />
          Enable all
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Registered" value={definitions.length} />
        <StatCard label="Enabled" value={enabledCount} />
        <StatCard label="Disabled" value={disabledRegisteredCount} />
      </div>

      <div className="space-y-3 border border-border bg-card p-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(260px,1fr)_auto_auto]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search blocks..."
              className="h-10 w-full border border-border bg-background pl-9 pr-3 text-sm text-foreground outline-hidden placeholder:text-muted-foreground focus:border-primary"
            />
          </label>
          <select
            value={activeCategory}
            onChange={(event) => setActiveCategory(event.target.value)}
            className="h-10 min-w-44 border border-border bg-background px-3 text-sm text-foreground outline-hidden focus:border-primary"
            aria-label="Filter by category"
          >
            <option value="all">All categories</option>
            {categories.map((category) => (
              <option key={category.key} value={category.key}>
                {category.label} ({category.count})
              </option>
            ))}
          </select>
          <select
            value={activeSource}
            onChange={(event) => setActiveSource(event.target.value)}
            className="h-10 min-w-40 border border-border bg-background px-3 text-sm text-foreground outline-hidden focus:border-primary"
            aria-label="Filter by source"
          >
            <option value="all">All sources</option>
            {sources.map(({ source, count }) => (
              <option key={source} value={source}>
                {source} ({count})
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap gap-2">
          <FilterPill
            active={activeCategory === "all"}
            label="All"
            count={definitions.length}
            onClick={() => setActiveCategory("all")}
          />
          {categories.map((category) => (
            <FilterPill
              key={category.key}
              active={activeCategory === category.key}
              label={category.label}
              count={category.count}
              onClick={() => setActiveCategory(category.key)}
            />
          ))}
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        {filteredBlocks.length === 0 ? (
          <div className="border border-dashed border-border p-8 text-center text-sm text-muted-foreground xl:col-span-2">
            No blocks match the current filters.
          </div>
        ) : (
          filteredBlocks.map((definition) => {
            const Icon = definition.icon;
            const source = getBlockSource(definition.name);
            const disabled = disabledSet.has(String(definition.name));
            const usageCount = usageByName.get(String(definition.name)) ?? 0;
            const rendererStatus = definition.rendererStatus ?? "ready";
            return (
              <article
                key={definition.name}
                className={cn(
                  "flex min-h-36 gap-4 border border-border bg-card p-4 transition-colors",
                  disabled && "opacity-70",
                )}
              >
                <div className="flex size-10 shrink-0 items-center justify-center border border-border bg-background text-muted-foreground">
                  <Icon className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-sm font-semibold text-foreground">
                      {definition.title}
                    </h2>
                    <span className="border border-border bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                      {source}
                    </span>
                    <span className="border border-border bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                      v{definition.version}
                    </span>
                    <span
                      className={cn(
                        "border border-border px-2 py-0.5 text-[11px] font-medium",
                        rendererStatus === "ready"
                          ? "bg-muted text-muted-foreground"
                          : "bg-destructive/10 text-destructive",
                      )}
                    >
                      renderer: {rendererStatus}
                    </span>
                  </div>
                  <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
                    {definition.name}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {definition.description}
                  </p>
                  {definition.keywords && definition.keywords.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {definition.keywords.slice(0, 6).map((keyword) => (
                        <span
                          key={keyword}
                          className="bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
                        >
                          {keyword}
                        </span>
                      ))}
                    </div>
                  )}
                  <p className="mt-3 text-xs text-muted-foreground">
                    Used on {usageCount} document{usageCount === 1 ? "" : "s"}.
                    {disabled && usageCount > 0
                      ? " Existing content is preserved; new insertion is disabled."
                      : ""}
                  </p>
                  {usageCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setUsageBlockName(String(definition.name))}
                      className="mt-2 text-xs font-medium text-primary hover:underline"
                    >
                      View usage
                    </button>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end justify-between gap-3">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 text-xs font-medium",
                      disabled ? "text-muted-foreground" : "text-primary",
                    )}
                  >
                    <SlidersHorizontal className="size-3.5" />
                    {disabled ? "Disabled" : "Enabled"}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant={disabled ? "default" : "outline"}
                    disabled={isLoading || savingName !== null}
                    onClick={() => void toggleBlock(definition)}
                  >
                    {savingName === String(definition.name)
                      ? "Saving..."
                      : disabled
                        ? "Enable"
                        : "Disable"}
                  </Button>
                </div>
              </article>
            );
          })
        )}
      </div>
      {usageBlockName && (
        <UsageDrawer
          usage={usageDetail}
          blockName={usageBlockName}
          onClose={() => setUsageBlockName(null)}
        />
      )}
    </div>
  );
}

function UsageDrawer({
  usage,
  blockName,
  onClose,
}: {
  usage:
    | {
        count: number;
        publishedCount: number;
        recent: Array<{
          _id: string;
          title: string;
          slug: string;
          type: "page" | "post";
          status: string;
          updatedAt?: number;
        }>;
      }
    | undefined;
  blockName: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" role="dialog" aria-modal="true">
      <div className="h-full w-full max-w-lg border-l border-border bg-card shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-border p-4">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Block usage</h2>
            <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{blockName}</p>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
        <div className="space-y-4 p-4">
          {!usage ? (
            <p className="text-sm text-muted-foreground">Loading usage...</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <StatCard label="Documents" value={usage.count} />
                <StatCard label="Published" value={usage.publishedCount} />
              </div>
              <div className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Recent documents
                </h3>
                {usage.recent.length === 0 ? (
                  <p className="border border-dashed border-border p-4 text-sm text-muted-foreground">
                    No matching documents found.
                  </p>
                ) : (
                  <ul className="divide-y divide-border border border-border">
                    {usage.recent.map((doc) => (
                      <li key={doc._id} className="p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-foreground">
                              {doc.title || "(untitled)"}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {doc.type} · {doc.status} · /{doc.slug}
                            </p>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-border bg-card p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold text-foreground">{value}</div>
    </div>
  );
}

function FilterPill({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 border border-border px-3 text-xs font-medium transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <span>{label}</span>
      <span className="opacity-75">{count}</span>
    </button>
  );
}
