/**
 * BlockOutline — the new admin-side editor for blocks.
 *
 * Design principles (see .codex/plans/BLOCK-EDITOR-REFACTOR-PLAN.md):
 *   1. Admin shows ONLY content + structure. No design controls anywhere.
 *   2. Front-end skill owns ALL presentation.
 *   3. AI is the primary author. (Hooks land in Phase 4.)
 *   4. Humans polish via direct manipulation — drag-and-drop reorder,
 *      click-to-edit a single block, insert between blocks, swap types.
 *   5. Block schemas are AI contracts — tight Zod constraints.
 *
 * UX shape (Notion-style outline):
 *   ┌─────────────────────────────────────────────┐
 *   │ ⋮⋮ Hero — "Ship faster..."   ✨ ⋯           │  ← collapsed
 *   └─────────────────────────────────────────────┘
 *      ┊ + Add block ┊
 *   ┌─────────────────────────────────────────────┐
 *   │ ⋮⋮ Feature Grid (3 items)   ✨ ⋯ [open]      │  ← expanded
 *   │                                              │
 *   │  [content fields render here]                │
 *   └─────────────────────────────────────────────┘
 */

import {
  ChevronDown,
  ChevronRight,
  CopyPlus,
  GripVertical,
  MoreHorizontal,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAction, useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import { toast } from "sonner";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { BlockLibraryButton } from "@/components/blocks/BlockLibraryButton";
import { Button } from "@/components/ui/button";
import {
  BLOCK_CATEGORY_ORDER,
  createBlock,
  getEnabledBlockDefinitions,
  getBlockDefinition,
} from "@/lib/blocks/registry";
import type { AdminBlockDefinition, BlockName, ConvexPressBlock } from "@/lib/blocks/types";
import { validateBlockInstance } from "@/lib/blocks/validation";
import { cn } from "@/lib/utils";

// ─── Save-state pill ─────────────────────────────────────────────────────────

type SaveStatus = "saved" | "dirty" | "saving" | "failed" | "conflict";

function SaveStatusPill({ status, message }: { status: SaveStatus; message?: string }) {
  const label = (() => {
    switch (status) {
      case "saving":
        return "Saving…";
      case "dirty":
        return "Unsaved";
      case "failed":
        return message ?? "Save failed";
      case "conflict":
        return "Conflict — refresh needed";
      case "saved":
      default:
        return "Saved";
    }
  })();
  return (
    <span
      className={cn(
        "text-xs font-medium",
        status === "failed" || status === "conflict"
          ? "text-destructive"
          : "text-muted-foreground",
      )}
      aria-live="polite"
    >
      {label}
    </span>
  );
}

// ─── Block content preview ────────────────────────────────────────────────────

/**
 * Best-effort one-line preview for a block's content, shown in the collapsed
 * row. Picks the most identifying field per block type, falls back to first
 * non-empty string attr.
 */
function blockPreview(block: ConvexPressBlock): string {
  const attrs = block.attrs ?? {};
  const get = (k: string) => {
    const v = (attrs as any)[k];
    return typeof v === "string" && v.trim() ? v.trim() : "";
  };

  switch (block.name) {
    case "core/heading":
      return get("text");
    case "core/paragraph":
      return get("body");
    case "core/list": {
      const items = (attrs as any).items;
      if (Array.isArray(items) && items.length > 0) {
        const first = items.find((i: any) => typeof i?.text === "string" && i.text.trim());
        return first ? `${first.text} (${items.length} items)` : `${items.length} items`;
      }
      return "";
    }
    case "core/image":
      return get("alt") || get("caption") || (get("mediaId") ? "Image" : "");
    case "core/quote":
      return get("text");
    case "core/code":
      return get("filename") || get("language") || "Code";
    case "core/divider":
      return "—";
    case "core/spacer":
      return get("size") || "Space";
    case "core/embed":
      return get("url") || get("caption");
    case "core/hero":
    case "core/rich-text":
    case "core/cta-band":
    case "core/media-text":
      return get("title") || get("heading");
    case "core/feature-grid": {
      const items = (attrs as any).items;
      const count = Array.isArray(items) ? items.length : 0;
      const heading = get("heading");
      return heading ? `${heading} (${count} cards)` : `${count} feature cards`;
    }
    case "core/testimonials": {
      const items = (attrs as any).items;
      const count = Array.isArray(items) ? items.length : 0;
      const heading = get("heading");
      return heading ? `${heading} (${count} quotes)` : `${count} testimonials`;
    }
    case "core/pricing-cards": {
      const plans = (attrs as any).plans;
      const count = Array.isArray(plans) ? plans.length : 0;
      return `${count} pricing plan${count === 1 ? "" : "s"}`;
    }
    case "core/faq": {
      const items = (attrs as any).items;
      const count = Array.isArray(items) ? items.length : 0;
      return `${count} question${count === 1 ? "" : "s"}`;
    }
    default: {
      // Fallback — first non-empty string attr.
      for (const key of ["heading", "title", "text", "body", "url"]) {
        const v = get(key);
        if (v) return v;
      }
      return "";
    }
  }
}

function truncate(text: string, max = 90) {
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + "…";
}

// ─── Block inserter popover ──────────────────────────────────────────────────

function BlockInserterPopover({
  blocks,
  open,
  onClose,
  onSelect,
}: {
  blocks: Array<AdminBlockDefinition<Record<string, unknown>>>;
  open: boolean;
  onClose: () => void;
  onSelect: (name: BlockName) => void;
}) {
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
    else setSearch("");
  }, [open]);

  // Esc closes
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const items = useMemo(() => {
    const q = search.trim().toLowerCase();
    return blocks.filter((def) => {
      if (!q) return true;
      const hay = [def.title, def.description, ...(def.keywords ?? [])]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [blocks, search]);

  const byCategory = useMemo(() => {
    const map = new Map<string, Array<AdminBlockDefinition<Record<string, unknown>>>>();
    for (const def of items) {
      const k = def.category;
      if (!map.has(k)) map.set(k, []);
      map.get(k)?.push(def);
    }
    return map;
  }, [items]);

  if (!open) return null;

  return (
    <div
      className="border border-border bg-card shadow-md"
      role="listbox"
      aria-label="Insert block"
    >
      <div className="border-b border-border px-3 py-2">
        <input
          ref={inputRef}
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search blocks…"
          className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-hidden"
        />
      </div>
      <div className="max-h-[320px] overflow-y-auto p-2">
        {items.length === 0 && (
          <p className="px-2 py-3 text-center text-xs text-muted-foreground">
            No blocks match.
          </p>
        )}
        {BLOCK_CATEGORY_ORDER.map(({ key, label }) => {
          const defs = byCategory.get(key);
          if (!defs || defs.length === 0) return null;
          return (
            <div key={key} className="mb-3 last:mb-0">
              <h4 className="px-2 mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {label}
              </h4>
              <div className="grid grid-cols-2 gap-1">
                {defs.map((def) => {
                  const Icon = def.icon;
                  return (
                    <button
                      key={def.name}
                      type="button"
                      onClick={() => {
                        onSelect(def.name);
                        onClose();
                      }}
                      className="flex items-start gap-2 px-2 py-1.5 text-left text-xs hover:bg-muted/50 transition-colors"
                      role="option"
                      aria-label={def.title}
                    >
                      <Icon className="size-3.5 shrink-0 mt-0.5 text-muted-foreground" />
                      <div className="min-w-0">
                        <div className="text-foreground truncate">{def.title}</div>
                        <div className="text-[10px] text-muted-foreground truncate">
                          {def.description}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Insert gap (the "+" between blocks) ─────────────────────────────────────

function InsertGap({
  blocks,
  onInsert,
}: {
  blocks: Array<AdminBlockDefinition<Record<string, unknown>>>;
  onInsert: (name: BlockName) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <div className="group relative h-1 hover:h-8 transition-all">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
          aria-label="Insert block here"
          aria-expanded={open}
        >
          <span className="inline-flex items-center gap-1 border border-border bg-card px-2 py-1 text-[10px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50">
            <Plus className="size-3" />
            Add block
          </span>
        </button>
      </div>
      {open && (
        <div className="absolute left-0 right-0 z-20 mt-1">
          <BlockInserterPopover
            blocks={blocks}
            open={open}
            onClose={() => setOpen(false)}
            onSelect={onInsert}
          />
        </div>
      )}
    </div>
  );
}

// ─── Block row (sortable) ────────────────────────────────────────────────────

type ImprovePreset = "shorter" | "longer" | "formal" | "casual" | "technical" | "playful";

interface BlockRowProps {
  block: ConvexPressBlock;
  index: number;
  isExpanded: boolean;
  disabled?: boolean;
  blockTypeDisabled?: boolean;
  isAiBusy?: boolean;
  onToggle: () => void;
  onAttrsChange: (attrs: Record<string, unknown>) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onRegenerate?: (refinement?: string) => void;
  onImprove?: (preset: ImprovePreset) => void;
  onVariants?: () => void;
  onSwap?: () => void;
}

function BlockRow({
  block,
  index,
  isExpanded,
  disabled,
  blockTypeDisabled,
  isAiBusy,
  onToggle,
  onAttrsChange,
  onDuplicate,
  onRemove,
  onRegenerate,
  onImprove,
  onVariants,
  onSwap,
}: BlockRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: block.id, disabled });

  const definition = getBlockDefinition(block.name);
  const validation = validateBlockInstance(block);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const Icon = definition?.icon;
  const preview = blockPreview(block);

  return (
    <article
      ref={setNodeRef}
      style={style}
      data-slot="block-row"
      data-block-id={block.id}
      className={cn(
        "border border-border bg-card transition-colors",
        isExpanded && "border-primary/40",
      )}
    >
      <header
        className="flex items-center gap-2 px-2 py-2"
        onClick={(e) => {
          // Don't toggle if click came from a control inside the header.
          if ((e.target as HTMLElement).closest("[data-row-control]")) return;
          onToggle();
        }}
        role="button"
        aria-expanded={isExpanded}
        aria-label={`${definition?.title ?? block.name} — block ${index + 1}`}
      >
        {/* Drag handle */}
        <button
          type="button"
          data-row-control
          {...attributes}
          {...listeners}
          aria-label="Drag to reorder"
          className="shrink-0 cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing disabled:cursor-not-allowed"
          disabled={disabled}
        >
          <GripVertical className="size-4" />
        </button>

        {/* Expand chevron */}
        <button
          type="button"
          data-row-control
          onClick={onToggle}
          aria-label={isExpanded ? "Collapse block" : "Expand block"}
          className="shrink-0 text-muted-foreground hover:text-foreground"
        >
          {isExpanded ? (
            <ChevronDown className="size-4" />
          ) : (
            <ChevronRight className="size-4" />
          )}
        </button>

        {/* Icon + title + preview */}
        <div className="min-w-0 flex-1 flex items-center gap-2">
          {Icon && <Icon className="size-4 shrink-0 text-muted-foreground" />}
          <span className="text-sm font-medium text-foreground truncate">
            {definition?.title ?? block.name}
          </span>
          {preview && (
            <span className="text-xs text-muted-foreground truncate">
              · {truncate(preview)}
            </span>
          )}
          {blockTypeDisabled && (
            <span className="shrink-0 border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              Disabled in library
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-0.5" data-row-control>
          {(onRegenerate || onImprove || onVariants || onSwap) && (
            <RowMenu
              triggerLabel="AI actions"
              triggerIcon={
                <Sparkles className={cn("size-3.5", isAiBusy && "animate-pulse text-primary")} />
              }
              items={[
                {
                  label: "Regenerate",
                  onSelect: () => onRegenerate?.(),
                  disabled: isAiBusy || !onRegenerate,
                },
                {
                  label: "Show 3 variants…",
                  onSelect: () => onVariants?.(),
                  disabled: isAiBusy || !onVariants,
                },
                {
                  label: "Make shorter",
                  onSelect: () => onImprove?.("shorter"),
                  disabled: isAiBusy || !onImprove,
                },
                {
                  label: "Make longer",
                  onSelect: () => onImprove?.("longer"),
                  disabled: isAiBusy || !onImprove,
                },
                {
                  label: "More formal",
                  onSelect: () => onImprove?.("formal"),
                  disabled: isAiBusy || !onImprove,
                },
                {
                  label: "More casual",
                  onSelect: () => onImprove?.("casual"),
                  disabled: isAiBusy || !onImprove,
                },
                {
                  label: "More technical",
                  onSelect: () => onImprove?.("technical"),
                  disabled: isAiBusy || !onImprove,
                },
                {
                  label: "More playful",
                  onSelect: () => onImprove?.("playful"),
                  disabled: isAiBusy || !onImprove,
                },
                {
                  label: "Swap block type…",
                  onSelect: () => onSwap?.(),
                  disabled: isAiBusy || !onSwap,
                },
              ]}
            />
          )}
          <RowMenu
            triggerLabel="Block actions"
            triggerIcon={<MoreHorizontal className="size-3.5" />}
            items={[
              {
                label: "Duplicate",
                icon: <CopyPlus className="size-3.5" />,
                onSelect: onDuplicate,
              },
              {
                label: "Delete",
                icon: <Trash2 className="size-3.5" />,
                onSelect: onRemove,
                destructive: true,
              },
            ]}
          />
        </div>
      </header>

      {isExpanded && (
        <div className="border-t border-border p-3" data-row-control>
          {!definition ? (
            <p className="text-sm text-destructive">Unknown block type: {block.name}</p>
          ) : !validation.ok ? (
            <p className="text-sm text-destructive">{validation.message}</p>
          ) : (
            <div className="space-y-3">
              {blockTypeDisabled && (
                <div className="border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
                  This block type is disabled for new inserts and AI generation,
                  but existing content can still be edited.
                </div>
              )}
              <definition.Editor
                block={validation.block}
                attrs={validation.block.attrs}
                onChange={onAttrsChange}
                disabled={disabled}
              />
            </div>
          )}
        </div>
      )}
    </article>
  );
}

// ─── Row menu (small dropdown) ───────────────────────────────────────────────

interface MenuItem {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  destructive?: boolean;
  disabled?: boolean;
  hint?: string;
}

function RowMenu({
  triggerLabel,
  triggerIcon,
  items,
}: {
  triggerLabel: string;
  triggerIcon: ReactNode;
  items: MenuItem[];
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={triggerLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex size-6 items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
      >
        {triggerIcon}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-1 min-w-[160px] border border-border bg-card shadow-md"
        >
          {items.map((item, idx) => (
            <button
              key={idx}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                if (item.disabled) return;
                item.onSelect();
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors",
                item.destructive
                  ? "text-destructive hover:bg-destructive/10"
                  : "text-foreground hover:bg-muted/50",
                item.disabled && "cursor-not-allowed opacity-50 hover:bg-transparent",
              )}
            >
              {item.icon}
              <span className="flex-1">{item.label}</span>
              {item.hint && (
                <span className="text-[10px] text-muted-foreground">{item.hint}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main outline editor ─────────────────────────────────────────────────────

interface BlockOutlineProps {
  postId: string;
  value: ConvexPressBlock[];
  revision?: number;
  onChange?: (blocks: ConvexPressBlock[], revision?: number) => void;
  onSelectedBlockChange?: (blockId: string | null) => void;
  disabled?: boolean;
  label?: string;
}

const SAVE_DEBOUNCE_MS = 800;

export function BlockOutline({
  postId,
  value,
  revision = 0,
  onChange,
  onSelectedBlockChange,
  disabled,
  label = "Page Blocks",
}: BlockOutlineProps) {
  const [blocks, setBlocks] = useState<ConvexPressBlock[]>(value);
  const [currentRevision, setCurrentRevision] = useState(revision);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [saveMessage, setSaveMessage] = useState<string>("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const dirtyRef = useRef(false);
  const saveStatusRef = useRef<SaveStatus>("saved");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blocksRef = useRef(blocks);
  const currentRevisionRef = useRef(currentRevision);
  const inFlightSaveRef = useRef(false);
  const queuedSaveRef = useRef<ConvexPressBlock[] | null>(null);
  blocksRef.current = blocks;
  currentRevisionRef.current = currentRevision;

  const setTrackedSaveStatus = useCallback((status: SaveStatus) => {
    saveStatusRef.current = status;
    setSaveStatus(status);
  }, []);

  const replaceBlocksMutation = useMutation(api.blocks.mutations.replaceBlocks);
  const regenerateAction = useAction((api as any).blocks.ai.regenerateBlock);
  const improveAction = useAction((api as any).blocks.ai.improveBlock);
  const variantsAction = useAction((api as any).blocks.ai.generateVariants);
  const swapTypeAction = useAction((api as any).blocks.ai.swapBlockType);
  const [aiBusyId, setAiBusyId] = useState<string | null>(null);
  const [variantsModal, setVariantsModal] = useState<{
    blockId: string;
    variants: Array<Record<string, unknown>>;
  } | null>(null);
  const [swapModal, setSwapModal] = useState<{ blockId: string } | null>(null);
  const blockSettings = useQuery(api.settings.queries.getBySection, {
    section: "blocks" as any,
  }) as { disabledBlockNames?: string[] } | null | undefined;
  const disabledBlockNames = blockSettings?.disabledBlockNames ?? [];
  const disabledBlockNameSet = useMemo(
    () => new Set(disabledBlockNames.map(String)),
    [disabledBlockNames],
  );
  const enabledBlockDefinitions = useMemo(
    () => getEnabledBlockDefinitions(disabledBlockNames),
    [disabledBlockNames],
  );

  // ── Sensors for DnD ──────────────────────────────────────────────────────
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // ── Sync from parent when not locally dirty ──────────────────────────────
  useEffect(() => {
    if (dirtyRef.current) return;
    setBlocks(value);
    setCurrentRevision(revision);
  }, [value, revision]);

  // ── Single debounced save path ───────────────────────────────────────────
  const performSave = useCallback(
    async (next: ConvexPressBlock[]) => {
      if (inFlightSaveRef.current) {
        queuedSaveRef.current = next;
        return;
      }
      inFlightSaveRef.current = true;
      setTrackedSaveStatus("saving");
      try {
        const result = await replaceBlocksMutation({
          postId: postId as Id<"posts">,
          blocks: next,
          expectedRevision: currentRevisionRef.current,
        });
        setCurrentRevision(result.revision);
        currentRevisionRef.current = result.revision;
        dirtyRef.current = false;
        setTrackedSaveStatus("saved");
        setSaveMessage("");
        onChange?.(next, result.revision);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Save failed";
        const isConflict = message.toLowerCase().includes("changed") || message.toLowerCase().includes("conflict");
        setTrackedSaveStatus(isConflict ? "conflict" : "failed");
        setSaveMessage(message);
      } finally {
        inFlightSaveRef.current = false;
        const queued = queuedSaveRef.current;
        queuedSaveRef.current = null;
        if (queued && saveStatusRef.current !== "conflict") {
          void performSave(queued);
        }
      }
    },
    [onChange, postId, replaceBlocksMutation, setTrackedSaveStatus],
  );

  const scheduleSave = useCallback(
    (next: ConvexPressBlock[]) => {
      dirtyRef.current = true;
      setTrackedSaveStatus("dirty");
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        void performSave(next);
      }, SAVE_DEBOUNCE_MS);
    },
    [performSave, setTrackedSaveStatus],
  );

  // ── Mutation helpers (local + scheduled save) ────────────────────────────
  const commitAndSave = useCallback(
    (next: ConvexPressBlock[]) => {
      setBlocks(next);
      onChange?.(next, currentRevision);
      scheduleSave(next);
    },
    [currentRevision, onChange, scheduleSave],
  );

  const handleAttrsChange = useCallback(
    (blockId: string, attrs: Record<string, unknown>) => {
      const next = blocksRef.current.map((b) =>
        b.id === blockId ? { ...b, attrs } : b,
      );
      commitAndSave(next);
    },
    [commitAndSave],
  );

  const handleDuplicate = useCallback(
    (blockId: string) => {
      const next = [...blocksRef.current];
      const index = next.findIndex((b) => b.id === blockId);
      if (index < 0) return;
      if (disabledBlockNameSet.has(String(next[index].name))) {
        toast.error("That block is disabled in Pages > Blocks and cannot be duplicated.");
        return;
      }
      const copy: ConvexPressBlock = {
        ...next[index],
        id: `blk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      };
      next.splice(index + 1, 0, copy);
      commitAndSave(next);
    },
    [commitAndSave, disabledBlockNameSet],
  );

  const handleRemove = useCallback(
    (blockId: string) => {
      const next = blocksRef.current.filter((b) => b.id !== blockId);
      commitAndSave(next);
      if (expandedId === blockId) {
        setExpandedId(null);
        onSelectedBlockChange?.(null);
      }
    },
    [commitAndSave, expandedId, onSelectedBlockChange],
  );

  const handleInsertAt = useCallback(
    (index: number, name: BlockName) => {
      if (disabledBlockNameSet.has(String(name))) {
        toast.error("That block is disabled in Pages > Blocks.");
        return;
      }
      const block = createBlock(name);
      const next = [...blocksRef.current];
      next.splice(index, 0, block);
      commitAndSave(next);
      // Auto-expand the freshly inserted block so the user can edit it.
      setExpandedId(block.id);
      onSelectedBlockChange?.(block.id);
    },
    [commitAndSave, disabledBlockNameSet, onSelectedBlockChange],
  );

  const handleAppend = useCallback(
    (name: BlockName) => handleInsertAt(blocksRef.current.length, name),
    [handleInsertAt],
  );

  // ── AI per-block actions ─────────────────────────────────────────────────
  const handleRegenerate = useCallback(
    async (blockId: string, refinement?: string) => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      setAiBusyId(blockId);
      try {
        const result = await regenerateAction({
          postId: postId as Id<"posts">,
          blockId,
          refinement,
          expectedRevision: currentRevision,
        });
        // Apply the new attrs locally; the action already wrote to the DB.
        setCurrentRevision(result.revision);
        currentRevisionRef.current = result.revision;
        setBlocks((prev) =>
          prev.map((b) =>
            b.id === blockId ? { ...b, attrs: result.attrs } : b,
          ),
        );
        onChange?.(
          blocksRef.current.map((b) =>
            b.id === blockId ? { ...b, attrs: result.attrs } : b,
          ),
          result.revision,
        );
        toast.success("Block updated by AI.");
      } catch (err) {
        const message = err instanceof Error ? err.message : "Regeneration failed";
        toast.error(message);
      } finally {
        setAiBusyId(null);
      }
    },
    [currentRevision, onChange, postId, regenerateAction],
  );

  const handleVariants = useCallback(
    async (blockId: string) => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      setAiBusyId(blockId);
      try {
        const result = await variantsAction({
          postId: postId as Id<"posts">,
          blockId,
          count: 3,
        });
        setVariantsModal({ blockId, variants: result.variants });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Variants failed";
        toast.error(message);
      } finally {
        setAiBusyId(null);
      }
    },
    [postId, variantsAction],
  );

  const handleAcceptVariant = useCallback(
    async (blockId: string, attrs: Record<string, unknown>) => {
      const next = blocksRef.current.map((b) =>
        b.id === blockId ? { ...b, attrs } : b,
      );
      commitAndSave(next);
      setVariantsModal(null);
      toast.success("Variant applied.");
    },
    [commitAndSave],
  );

  const handleSwapType = useCallback(
    async (blockId: string, targetBlockName: BlockName) => {
      if (disabledBlockNameSet.has(String(targetBlockName))) {
        toast.error("That block is disabled in Pages > Blocks.");
        return;
      }
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      setAiBusyId(blockId);
      try {
        const result = await swapTypeAction({
          postId: postId as Id<"posts">,
          blockId,
          targetBlockName,
        });
        const next = blocksRef.current.map((b) =>
          b.id === blockId
            ? { ...b, name: targetBlockName, attrs: result.attrs, version: 1 }
            : b,
        );
        commitAndSave(next);
        setSwapModal(null);
        toast.success(`Block swapped to ${targetBlockName}.`);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Swap failed";
        toast.error(message);
      } finally {
        setAiBusyId(null);
      }
    },
    [commitAndSave, disabledBlockNameSet, postId, swapTypeAction],
  );

  const handleImprove = useCallback(
    async (
      blockId: string,
      preset: "shorter" | "longer" | "formal" | "casual" | "technical" | "playful",
    ) => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      setAiBusyId(blockId);
      try {
        const result = await improveAction({
          postId: postId as Id<"posts">,
          blockId,
          preset,
          expectedRevision: currentRevision,
        });
        setCurrentRevision(result.revision);
        currentRevisionRef.current = result.revision;
        setBlocks((prev) =>
          prev.map((b) =>
            b.id === blockId ? { ...b, attrs: result.attrs } : b,
          ),
        );
        onChange?.(
          blocksRef.current.map((b) =>
            b.id === blockId ? { ...b, attrs: result.attrs } : b,
          ),
          result.revision,
        );
        toast.success(`Block improved (${preset}).`);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Improve failed";
        toast.error(message);
      } finally {
        setAiBusyId(null);
      }
    },
    [currentRevision, improveAction, onChange, postId],
  );

  // ── Drag-end handler ─────────────────────────────────────────────────────
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIndex = blocksRef.current.findIndex((b) => b.id === active.id);
      const newIndex = blocksRef.current.findIndex((b) => b.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return;
      const next = arrayMove(blocksRef.current, oldIndex, newIndex);
      commitAndSave(next);
    },
    [commitAndSave],
  );

  // ── Conflict actions ─────────────────────────────────────────────────────
  const handleResolveConflictDiscardMine = useCallback(() => {
    dirtyRef.current = false;
    setBlocks(value);
    setCurrentRevision(revision);
    setTrackedSaveStatus("saved");
    setSaveMessage("");
    onSelectedBlockChange?.(null);
  }, [onSelectedBlockChange, revision, setTrackedSaveStatus, value]);

  return (
    <section data-slot="block-outline" className="border border-border bg-card">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{label}</h2>
          <p className="text-xs text-muted-foreground">
            Drag to reorder. Click a block to edit. Click the gaps to insert.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <BlockLibraryButton
            align="right"
            blocks={enabledBlockDefinitions}
            disabled={disabled || saveStatus === "saving"}
            onSelect={handleAppend}
          />
          <SaveStatusPill status={saveStatus} message={saveMessage} />
        </div>
      </div>

      {/* Conflict banner */}
      {saveStatus === "conflict" && (
        <div className="border-b border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <div className="flex items-center justify-between gap-3">
            <span>
              Someone else edited this page. Your in-progress changes haven't
              been saved.
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleResolveConflictDiscardMine}
                className="font-medium underline-offset-2 hover:underline"
              >
                Discard mine and reload
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Block list */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={blocks.map((b) => b.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-1 p-2">
            {blocks.length === 0 ? (
              <EmptyState
                blocks={enabledBlockDefinitions}
                onInsert={(name) => handleInsertAt(0, name)}
              />
            ) : (
              <>
                {/* Top insert gap */}
                <InsertGap
                  blocks={enabledBlockDefinitions}
                  onInsert={(name) => handleInsertAt(0, name)}
                />
                {blocks.map((block, idx) => (
                  <div key={block.id}>
                    <BlockRow
                      block={block}
                      index={idx}
                      isExpanded={expandedId === block.id}
                      disabled={disabled || aiBusyId === block.id}
                      blockTypeDisabled={disabledBlockNameSet.has(String(block.name))}
                      isAiBusy={aiBusyId === block.id}
                      onToggle={() =>
                        setExpandedId((id) => {
                          const next = id === block.id ? null : block.id;
                          onSelectedBlockChange?.(next);
                          return next;
                        })
                      }
                      onAttrsChange={(attrs) => handleAttrsChange(block.id, attrs)}
                      onDuplicate={() => handleDuplicate(block.id)}
                      onRemove={() => handleRemove(block.id)}
                      onRegenerate={(refinement) =>
                        void handleRegenerate(block.id, refinement)
                      }
                      onImprove={(preset) => void handleImprove(block.id, preset)}
                      onVariants={() => void handleVariants(block.id)}
                      onSwap={() => setSwapModal({ blockId: block.id })}
                    />
                    <InsertGap
                      blocks={enabledBlockDefinitions}
                      onInsert={(name) => handleInsertAt(idx + 1, name)}
                    />
                  </div>
                ))}
              </>
            )}
          </div>
        </SortableContext>
      </DndContext>

      {/* Always-visible append button at the bottom for accessibility */}
      {blocks.length > 0 && (
        <div className="border-t border-border p-3 flex justify-center">
          <AppendBlockButton
            blocks={enabledBlockDefinitions}
            onAppend={handleAppend}
          />
        </div>
      )}

      {/* Variants modal */}
      {variantsModal && (
        <VariantsModal
          blockName={
            blocks.find((b) => b.id === variantsModal.blockId)?.name ?? "block"
          }
          variants={variantsModal.variants}
          onPick={(attrs) => handleAcceptVariant(variantsModal.blockId, attrs)}
          onClose={() => setVariantsModal(null)}
        />
      )}

      {/* Swap-type modal */}
      {swapModal && (
        <SwapTypeModal
          blocks={enabledBlockDefinitions}
          currentBlock={blocks.find((b) => b.id === swapModal.blockId)}
          onSwap={(target) => handleSwapType(swapModal.blockId, target)}
          onClose={() => setSwapModal(null)}
        />
      )}
    </section>
  );
}

// ─── Variants modal ──────────────────────────────────────────────────────────

const NOOP_VARIANT_ONCHANGE = () => {
  /* Variants modal renders the editor read-only; onChange is a no-op. */
};

/**
 * Render a single AI-generated variant in read-only mode by reusing the
 * block's own Editor. This shows the user the structured content that will
 * land in the page if they pick this variant — not raw JSON.
 *
 * If the Editor isn't defined or throws (e.g. malformed attrs), we fall back
 * to a compact attrs summary so the user can still make a choice.
 */
function VariantPreview({
  blockName,
  attrs,
}: {
  blockName: string;
  attrs: Record<string, unknown>;
}) {
  const definition = getBlockDefinition(blockName);
  if (!definition) {
    return <VariantAttrsSummary attrs={attrs} />;
  }

  // Build a synthetic block envelope. The id is throwaway because the
  // preview never gets persisted — the modal hands `attrs` (not the whole
  // block) to its `onPick` callback.
  const previewBlock: ConvexPressBlock = {
    id: `preview_${blockName}`,
    name: blockName,
    version: definition.version,
    attrs,
  };

  const Editor = definition.Editor;
  return (
    <div className="pointer-events-none select-text [&_input]:cursor-default [&_textarea]:cursor-default">
      <Editor
        block={previewBlock}
        attrs={attrs}
        onChange={NOOP_VARIANT_ONCHANGE}
        disabled
      />
    </div>
  );
}

/**
 * Fallback for blocks without an Editor — render attrs as a labelled key/value
 * list rather than dumping JSON.
 */
function VariantAttrsSummary({ attrs }: { attrs: Record<string, unknown> }) {
  const entries = Object.entries(attrs);
  if (entries.length === 0) {
    return (
      <p className="text-xs italic text-muted-foreground">
        No fields to preview.
      </p>
    );
  }
  return (
    <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1.5 text-xs">
      {entries.map(([key, value]) => (
        <div key={key} className="contents">
          <dt className="font-medium text-muted-foreground">{key}</dt>
          <dd className="break-words text-foreground">{formatVariantValue(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function formatVariantValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value.length > 200 ? `${value.slice(0, 200)}…` : value;
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) return `${value.length} item${value.length === 1 ? "" : "s"}`;
  if (typeof value === "object") return "{…}";
  return String(value);
}

function VariantsModal({
  blockName,
  variants,
  onPick,
  onClose,
}: {
  blockName: string;
  variants: Array<Record<string, unknown>>;
  onPick: (attrs: Record<string, unknown>) => void;
  onClose: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Pick a variant"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="max-h-[90vh] w-full max-w-3xl overflow-hidden border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-foreground">
            Pick a variant for {blockName}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-muted-foreground hover:text-foreground"
            aria-label="Close"
          >
            Cancel
          </button>
        </div>
        <div className="max-h-[calc(90vh-3rem)] overflow-y-auto p-4 space-y-4">
          {variants.map((attrs, idx) => (
            <div
              key={idx}
              className="border border-border bg-background p-3 transition-colors hover:border-primary/40"
            >
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">
                  Variant {idx + 1}
                </span>
                <Button type="button" size="sm" onClick={() => onPick(attrs)}>
                  Use this
                </Button>
              </div>
              <div className="border border-dashed border-border bg-muted/30 p-3">
                <VariantPreview blockName={blockName} attrs={attrs} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Swap-type modal ─────────────────────────────────────────────────────────

function SwapTypeModal({
  blocks,
  currentBlock,
  onSwap,
  onClose,
}: {
  blocks: Array<AdminBlockDefinition<Record<string, unknown>>>;
  currentBlock: ConvexPressBlock | undefined;
  onSwap: (target: BlockName) => void;
  onClose: () => void;
}) {
  const [target, setTarget] = useState<BlockName | "">("");
  const currentName = currentBlock?.name;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Swap block type"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-foreground">Swap block type</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-muted-foreground hover:text-foreground"
            aria-label="Close"
          >
            Cancel
          </button>
        </div>
        <div className="p-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            AI will map content from the current block into the target's fields.
            Fields that don't carry over will be generated.
          </p>
          <select
            value={target}
            onChange={(e) => setTarget(e.target.value as BlockName)}
            className="w-full h-9 border border-border bg-background px-2 text-sm text-foreground outline-hidden focus:border-primary"
          >
            <option value="">Pick a target type…</option>
            {blocks.filter((def) => def.name !== currentName).map((def) => (
              <option key={def.name} value={def.name}>
                {def.title}
              </option>
            ))}
          </select>
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!target}
              onClick={() => target && onSwap(target as BlockName)}
              className="gap-1.5"
            >
              <Sparkles className="size-3.5" />
              Swap with AI
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyState({
  blocks,
  onInsert,
}: {
  blocks: Array<AdminBlockDefinition<Record<string, unknown>>>;
  onInsert: (name: BlockName) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative border border-dashed border-border p-8 text-center">
      <p className="text-sm font-medium text-foreground">No blocks yet</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Add your first block to start composing this page.
      </p>
      <div className="mt-4 inline-block">
        <Button
          type="button"
          size="sm"
          onClick={() => setOpen((v) => !v)}
          className="gap-1.5"
        >
          <Plus className="size-3.5" />
          Add a block
        </Button>
        {open && (
          <div className="absolute left-1/2 top-full z-20 -translate-x-1/2 mt-2 w-[320px]">
            <BlockInserterPopover
              blocks={blocks}
              open={open}
              onClose={() => setOpen(false)}
              onSelect={onInsert}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function AppendBlockButton({
  blocks,
  onAppend,
}: {
  blocks: Array<AdminBlockDefinition<Record<string, unknown>>>;
  onAppend: (name: BlockName) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen((v) => !v)}
        className="gap-1.5"
      >
        <Plus className="size-3.5" />
        Add block
      </Button>
      {open && (
        <div className="absolute left-1/2 bottom-full z-20 -translate-x-1/2 mb-2 w-[320px]">
          <BlockInserterPopover
            blocks={blocks}
            open={open}
            onClose={() => setOpen(false)}
            onSelect={(name) => {
              onAppend(name);
              setOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}
