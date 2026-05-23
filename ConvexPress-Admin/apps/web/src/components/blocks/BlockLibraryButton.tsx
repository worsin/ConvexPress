import { Search, Plus } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  BLOCK_CATEGORY_ORDER,
  REGISTERED_BLOCKS,
} from "@/lib/blocks/registry";
import type { AdminBlockDefinition, BlockName } from "@/lib/blocks/types";
import { cn } from "@/lib/utils";

interface BlockLibraryButtonProps {
  onSelect: (name: BlockName) => void;
  disabled?: boolean;
  label?: string;
  align?: "left" | "right" | "center";
  variant?: "default" | "outline";
  size?: "sm" | "default";
  blocks?: Array<AdminBlockDefinition<Record<string, unknown>>>;
}

export function BlockLibraryButton({
  onSelect,
  disabled,
  label = "Add block",
  align = "left",
  variant = "outline",
  size = "sm",
  blocks = REGISTERED_BLOCKS,
}: BlockLibraryButtonProps) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (
        buttonRef.current?.contains(target) ||
        popoverRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div className="relative inline-flex">
      <Button
        ref={buttonRef}
        type="button"
        variant={variant}
        size={size}
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
        className="gap-1.5"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <Plus className="size-3.5" />
        {label}
      </Button>
      {open && (
        <div
          ref={popoverRef}
          className={cn(
            "absolute top-full z-30 mt-2 w-[min(92vw,680px)]",
            align === "right" && "right-0",
            align === "left" && "left-0",
            align === "center" && "left-1/2 -translate-x-1/2",
          )}
        >
          <BlockLibraryPanel
            blocks={blocks}
            onSelect={(name) => {
              onSelect(name);
              setOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}

function BlockLibraryPanel({
  blocks,
  onSelect,
}: {
  blocks: Array<AdminBlockDefinition<Record<string, unknown>>>;
  onSelect: (name: BlockName) => void;
}) {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const visibleBlocks = useMemo(() => {
    const q = query.trim().toLowerCase();
    return blocks.filter((definition) => {
      if (activeCategory !== "all" && definition.category !== activeCategory) {
        return false;
      }
      if (!q) return true;
      const haystack = [
        definition.title,
        definition.description,
        definition.name,
        ...(definition.keywords ?? []),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [activeCategory, blocks, query]);

  const categories = useMemo(
    () =>
      BLOCK_CATEGORY_ORDER.map((category) => ({
        ...category,
        count: blocks.filter((block) => block.category === category.key).length,
      })).filter((category) => category.count > 0),
    [blocks],
  );

  return (
    <div
      role="dialog"
      aria-label="Block library"
      className="overflow-hidden border border-border bg-card shadow-xl"
    >
      <div className="border-b border-border p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search blocks by name, use, or keyword..."
            className="h-9 w-full border border-border bg-background pl-8 pr-3 text-sm text-foreground outline-hidden placeholder:text-muted-foreground focus:border-primary"
          />
        </div>
      </div>

      <div className="grid max-h-[540px] grid-cols-[160px_1fr] overflow-hidden">
        <nav className="border-r border-border bg-muted/20 p-2" aria-label="Block categories">
          <CategoryButton
            active={activeCategory === "all"}
            label="All blocks"
            count={blocks.length}
            onClick={() => setActiveCategory("all")}
          />
          {categories.map((category) => (
            <CategoryButton
              key={category.key}
              active={activeCategory === category.key}
              label={category.label}
              count={category.count}
              onClick={() => setActiveCategory(category.key)}
            />
          ))}
        </nav>

        <div className="max-h-[540px] overflow-y-auto p-3">
          {visibleBlocks.length === 0 ? (
            <div className="border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              No blocks match that search.
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {visibleBlocks.map((definition) => {
                const Icon = definition.icon;
                return (
                  <button
                    key={definition.name}
                    type="button"
                    onClick={() => onSelect(definition.name)}
                    className="group flex min-h-24 items-start gap-3 border border-border bg-background p-3 text-left transition-colors hover:border-primary/50 hover:bg-muted/30"
                  >
                    <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center border border-border bg-card text-muted-foreground group-hover:text-foreground">
                      <Icon className="size-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-foreground">
                        {definition.title}
                      </span>
                      <span className="mt-1 line-clamp-2 block text-xs leading-5 text-muted-foreground">
                        {definition.description}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CategoryButton({
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
        "flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-xs transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <span className="truncate">{label}</span>
      <span
        className={cn(
          "shrink-0 text-[10px]",
          active ? "text-primary-foreground/80" : "text-muted-foreground",
        )}
      >
        {count}
      </span>
    </button>
  );
}
