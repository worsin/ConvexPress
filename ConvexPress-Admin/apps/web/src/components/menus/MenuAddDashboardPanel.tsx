/**
 * "Dashboard pages" add-items panel: customer dashboard registry pages,
 * grouped by registry group, with icon, description, and plugin badge.
 */

import { useMemo, useState, useTransition } from "react";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import { toast } from "sonner";
import { LayoutPanelLeft, LoaderIcon, PlusIcon, SearchIcon } from "lucide-react";

import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { getDashboardPage } from "@backend/convex/extensions/dashboard/registry";
import { LucideDynamicIcon } from "@/components/icons/LucideDynamicIcon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { PAGE_GROUP_LABELS, PAGE_GROUP_ORDER } from "@/lib/customer-dashboard/settings-model";
import type { LinkableDashboardPage } from "./types";

interface MenuAddDashboardPanelProps {
  menuId: Id<"menus">;
}

export function MenuAddDashboardPanel({ menuId }: MenuAddDashboardPanelProps) {
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isAdding, startAdding] = useTransition();
  const addMenuItem = useMutation(api.menus.mutations.addMenuItem);

  const pages = useQuery(api.menus.queries.getLinkableContent, {
    type: "dashboard",
    search: search.trim() || undefined,
    limit: 100,
  }) as LinkableDashboardPage[] | undefined;

  const groups = useMemo(() => {
    const list = pages ?? [];
    return PAGE_GROUP_ORDER.map((group) => ({
      group,
      label: PAGE_GROUP_LABELS[group],
      pages: list.filter((page) => page.group === group),
    })).filter((entry) => entry.pages.length > 0);
  }, [pages]);

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAdd = () => {
    if (!pages || selectedIds.size === 0) return;
    startAdding(async () => {
      try {
        const selected = pages.filter((page) => selectedIds.has(page.id));
        for (const page of selected) {
          const registryPage = getDashboardPage(page.id);
          await addMenuItem({
            menuId,
            itemType: "dashboard",
            objectId: page.id,
            label: page.title,
            url: page.url,
            icon: page.icon,
            ...(registryPage?.badge ? { badge: registryPage.badge } : {}),
          });
        }
        toast.success(`${selected.length} dashboard page${selected.length === 1 ? "" : "s"} added to menu`);
        setSelectedIds(new Set());
      } catch (error: unknown) {
        toast.error(error instanceof Error ? error.message : "Failed to add dashboard pages");
      }
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs font-medium text-foreground">
        <LayoutPanelLeft className="size-3" />
        Dashboard pages
      </div>
      <p className="text-[10px] text-muted-foreground">
        Pages from the customer dashboard registry. Links follow the dashboard base path unless the item overrides it.
      </p>
      <div className="relative">
        <SearchIcon className="absolute left-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
        <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search dashboard pages…" className="h-7 pl-7 text-[10px]" aria-label="Search dashboard pages" />
      </div>

      <div className="max-h-64 overflow-y-auto border border-border">
        {pages === undefined ? (
          <div className="p-3 text-center">
            <LoaderIcon className="mx-auto size-3 animate-spin text-muted-foreground" />
          </div>
        ) : groups.length === 0 ? (
          <p className="p-3 text-center text-[10px] text-muted-foreground">No dashboard pages found.</p>
        ) : (
          groups.map((group) => (
            <div key={group.group}>
              <div className="eyebrow border-b border-border bg-surface-2 px-2 py-1">{group.label}</div>
              <ul className="divide-y divide-border">
                {group.pages.map((page) => (
                  <li key={page.id} className="px-2 py-1.5">
                    <label className="flex w-full cursor-pointer items-start gap-2">
                      <Checkbox checked={selectedIds.has(page.id)} onCheckedChange={() => toggle(page.id)} className="mt-0.5" />
                      <LucideDynamicIcon name={page.icon} className="mt-0.5 size-3.5 shrink-0 text-ink-2" />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-1">
                          <span className="text-[11px] font-medium text-foreground">{page.title}</span>
                          {page.pluginId !== "core" && (
                            <Badge variant="outline" className="h-3.5 px-1 text-[9px]">
                              {page.pluginId}
                            </Badge>
                          )}
                        </span>
                        <span className="block text-[10px] text-muted-foreground">{page.description}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </div>

      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground">{selectedIds.size} selected</span>
        <Button variant="outline" size="xs" onClick={handleAdd} disabled={isAdding || selectedIds.size === 0}>
          {isAdding ? <LoaderIcon className="size-3 animate-spin" /> : <PlusIcon className="size-3" />}
          Add to Menu
        </Button>
      </div>
    </div>
  );
}
