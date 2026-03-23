/**
 * Event Code Select Component
 *
 * Accessible dropdown selector for webhook event codes, grouped by system.
 * Includes wildcard options at the top and search filtering.
 *
 * Uses Base UI Menu for keyboard navigation and ARIA compliance.
 */

import { useState, useMemo, useCallback } from "react";
import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import { ChevronDownIcon, CheckIcon, SearchIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { EVENT_CODE_GROUPS } from "@/lib/api/constants";

interface EventCodeSelectProps {
  value: string;
  onChange: (code: string) => void;
}

export function EventCodeSelect({ value, onChange }: EventCodeSelectProps) {
  const [search, setSearch] = useState("");

  const filteredGroups = useMemo(
    () =>
      EVENT_CODE_GROUPS.map((group) => ({
        ...group,
        events: group.events.filter(
          (e) =>
            e.code.toLowerCase().includes(search.toLowerCase()) ||
            e.label.toLowerCase().includes(search.toLowerCase()),
        ),
      })).filter((g) => g.events.length > 0),
    [search],
  );

  const selectedLabel = useMemo(
    () =>
      EVENT_CODE_GROUPS.flatMap((g) => g.events).find((e) => e.code === value)
        ?.label ?? value,
    [value],
  );

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        setSearch("");
      }
    },
    [],
  );

  return (
    <MenuPrimitive.Root onOpenChange={handleOpenChange}>
      <MenuPrimitive.Trigger
        className={cn(
          "flex items-center justify-between w-full h-8 border border-border bg-transparent px-2.5 text-xs",
          "focus:border-ring focus:ring-1 focus:ring-ring/50 outline-hidden",
          !value && "text-muted-foreground",
        )}
      >
        <span className="truncate">
          {value ? selectedLabel : "Select an event..."}
        </span>
        <ChevronDownIcon className="size-3 shrink-0 text-muted-foreground ml-2" />
      </MenuPrimitive.Trigger>

      <MenuPrimitive.Portal>
        <MenuPrimitive.Positioner
          className="isolate z-50 outline-hidden"
          align="start"
          side="bottom"
          sideOffset={4}
        >
          <MenuPrimitive.Popup className="max-h-60 overflow-y-auto border border-border bg-card shadow-lg w-(--anchor-width) origin-(--transform-origin) data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 duration-100">
            {/* Search input - not a menu item so it stays separate */}
            <div className="sticky top-0 bg-card border-b border-border p-1.5 z-10">
              <div className="relative">
                <SearchIcon className="absolute left-2 top-1/2 -translate-y-1/2 size-3 text-muted-foreground" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search events..."
                  className="w-full h-6 pl-6 pr-2 text-xs bg-transparent border border-border outline-hidden focus:border-ring"
                  autoFocus
                  onKeyDown={(e) => e.stopPropagation()}
                />
              </div>
            </div>

            {filteredGroups.length === 0 ? (
              <div className="px-3 py-4 text-xs text-muted-foreground text-center">
                No matching events
              </div>
            ) : (
              filteredGroups.map((group) => (
                <MenuPrimitive.Group key={group.label}>
                  <MenuPrimitive.GroupLabel className="px-2 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider bg-muted/50">
                    {group.label}
                  </MenuPrimitive.GroupLabel>
                  {group.events.map((event) => (
                    <MenuPrimitive.Item
                      key={event.code}
                      className={cn(
                        "w-full flex items-center gap-2 px-2 py-1.5 text-xs text-left cursor-default outline-hidden",
                        "focus:bg-muted transition-colors",
                        "data-highlighted:bg-muted",
                        value === event.code && "bg-primary/5 text-primary",
                      )}
                      onSelect={() => onChange(event.code)}
                    >
                      <code className="text-[10px] font-mono text-muted-foreground shrink-0">
                        {event.code}
                      </code>
                      <span className="truncate flex-1">{event.label}</span>
                      {value === event.code && (
                        <CheckIcon className="size-3 text-primary shrink-0" />
                      )}
                    </MenuPrimitive.Item>
                  ))}
                </MenuPrimitive.Group>
              ))
            )}
          </MenuPrimitive.Popup>
        </MenuPrimitive.Positioner>
      </MenuPrimitive.Portal>
    </MenuPrimitive.Root>
  );
}
