import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import { api } from "@backend/convex/_generated/api";
import { toast } from "sonner";
import { Eye, Trash2Icon } from "lucide-react";

import { getDashboardPage } from "@backend/convex/extensions/dashboard/registry";
import { SelectControl } from "@/components/customer-dashboard/fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import type { ScopeOptions } from "@/lib/customer-dashboard/scopes";
import {
  BADGE_SOURCE_OPTIONS,
  buildMenuItemUpdateArgs,
  createMenuItemDraft,
  draftSignature,
  isStructuralItem,
  MENU_VISIBILITY_OPTIONS,
  normalizeMenuItemDraft,
  originalReference,
  validateMenuItemDraft,
  type MenuItemDraft,
} from "@/lib/menus/item-editor-model";
import type { Id } from "@backend/convex/_generated/dataModel";
import { IconPicker } from "./IconPicker";
import { ScopeMultiSelect } from "./ScopeMultiSelect";
import type { MenuItem } from "./types";

interface MenuItemEditorProps {
  item: MenuItem;
  onClose: () => void;
  onRemove: (itemId: Id<"menuItems">) => void;
}

function FieldLabel({ htmlFor, children }: { htmlFor?: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-0.5 block text-[10px] text-muted-foreground">
      {children}
    </label>
  );
}

/**
 * Expanded editor form for a single menu item. Autosaves 600ms after the last
 * change. Link fields (URL, title attribute, new tab, rel) are hidden for
 * headings and separators; path override only applies to dashboard pages.
 */
export function MenuItemEditor({ item, onClose, onRemove }: MenuItemEditorProps) {
  const updateMenuItem = useMutation(api.menus.mutations.updateMenuItem);
  const scopeOptions = useQuery(api.extensions.dashboard.queries.scopeOptions) as ScopeOptions | undefined;

  const [draft, setDraft] = useState<MenuItemDraft>(() => createMenuItemDraft(item));
  const [saveStatus, setSaveStatus] = useState<"idle" | "pending" | "saving" | "saved" | "error">("idle");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const structural = isStructuralItem(item.itemType);
  const isSeparator = item.itemType === "separator";
  const isDashboard = item.itemType === "dashboard";
  const registryPage = isDashboard ? getDashboardPage(item.objectId ?? "") : undefined;

  const normalized = useMemo(() => normalizeMenuItemDraft(draft, item.itemType), [draft, item.itemType]);
  const errors = useMemo(() => validateMenuItemDraft(normalized, item.itemType), [normalized, item.itemType]);
  const signature = useMemo(() => draftSignature(normalized), [normalized]);
  const lastSavedSignatureRef = useRef(draftSignature(normalizeMenuItemDraft(createMenuItemDraft(item), item.itemType)));
  const hasErrors = Object.keys(errors).length > 0;

  const set = <K extends keyof MenuItemDraft>(key: K, value: MenuItemDraft[K]) => setDraft((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    if (signature === lastSavedSignatureRef.current) {
      if (saveStatus === "pending" || saveStatus === "saving") setSaveStatus("idle");
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      return;
    }
    if (hasErrors) {
      setSaveStatus("error");
      return;
    }
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    setSaveStatus("pending");
    const payload = buildMenuItemUpdateArgs(normalized, item);
    const payloadSignature = signature;
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      setSaveStatus("saving");
      void updateMenuItem(payload)
        .then(() => {
          lastSavedSignatureRef.current = payloadSignature;
          setSaveStatus("saved");
        })
        .catch((error) => {
          setSaveStatus("error");
          toast.error(error instanceof Error ? error.message : "Failed to update item");
        });
    }, 600);
  }, [hasErrors, item, normalized, saveStatus, signature, updateMenuItem]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, []);

  const statusMessage = () => {
    const firstError = Object.values(errors)[0];
    if (firstError) return firstError;
    if (saveStatus === "saving") return "Saving...";
    if (saveStatus === "pending") return "Saving shortly...";
    if (saveStatus === "error") return "Autosave failed";
    return "Saved";
  };

  const roleChoices = (scopeOptions?.roles ?? []).map((role) => ({ slug: role.slug, name: role.name, hint: role.type }));
  const planChoices = (scopeOptions?.plans ?? []).map((plan) => ({ slug: plan.slug, name: plan.name }));
  const uid = (field: string) => `menu-item-${item._id}-${field}`;

  return (
    <div className="space-y-3 border-t border-border bg-muted/20 p-3">
      {item.itemType === "custom" && (
        <div>
          <FieldLabel htmlFor={uid("url")}>URL</FieldLabel>
          <Input id={uid("url")} value={draft.url} onChange={(event) => set("url", event.target.value)} placeholder="https://" aria-invalid={Boolean(errors.url)} />
        </div>
      )}

      {!isSeparator && (
        <div>
          <FieldLabel htmlFor={uid("label")}>{item.itemType === "heading" ? "Heading text" : "Navigation Label"}</FieldLabel>
          <Input id={uid("label")} value={draft.label} onChange={(event) => set("label", event.target.value)} placeholder="Navigation Label" aria-invalid={Boolean(errors.label)} />
        </div>
      )}

      {/* Presentation */}
      {!isSeparator && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor={uid("icon")}>Icon</FieldLabel>
            <IconPicker id={uid("icon")} value={draft.icon} onChange={(name) => set("icon", name)} fallbackIcon={registryPage?.icon} />
          </div>
          {!structural && (
            <div>
              <FieldLabel htmlFor={uid("badge")}>Badge</FieldLabel>
              <SelectControl
                id={uid("badge")}
                size="sm"
                value={draft.badge || "none"}
                onValueChange={(value) => set("badge", value === "none" ? "" : value)}
                options={[{ value: "none", label: "No badge" }, ...BADGE_SOURCE_OPTIONS.map((option) => ({ value: option.value, label: option.label, description: option.value }))]}
                className="text-xs"
              />
              {registryPage?.badge && !draft.badge && (
                <p className="mt-0.5 text-[10px] text-muted-foreground">Registry default: {registryPage.badge}</p>
              )}
            </div>
          )}
        </div>
      )}

      {isDashboard && (
        <div>
          <FieldLabel htmlFor={uid("pathOverride")}>Path override</FieldLabel>
          <Input
            id={uid("pathOverride")}
            value={draft.pathOverride}
            onChange={(event) => set("pathOverride", event.target.value)}
            placeholder="Leave empty to use the dashboard base path"
            className="font-mono"
            aria-invalid={Boolean(errors.pathOverride)}
          />
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            Links to <span className="font-mono">{(normalized.pathOverride || "<base path>") + (registryPage?.path ?? "")}</span>
          </p>
        </div>
      )}

      {!structural && (
        <>
          <div>
            <FieldLabel htmlFor={uid("title")}>Title Attribute</FieldLabel>
            <Input id={uid("title")} value={draft.title} onChange={(event) => set("title", event.target.value)} placeholder="Title attribute (tooltip)" />
          </div>
          <label className="flex cursor-pointer items-center gap-2">
            <Checkbox checked={draft.openInNewTab} onCheckedChange={(checked) => set("openInNewTab", checked === true)} />
            <span className="text-[10px] text-foreground">Open link in a new tab</span>
          </label>
        </>
      )}

      <div>
        <FieldLabel htmlFor={uid("cssClasses")}>CSS Classes (optional)</FieldLabel>
        <Input id={uid("cssClasses")} value={draft.cssClasses} onChange={(event) => set("cssClasses", event.target.value)} placeholder="Space-separated class names" />
      </div>

      {!structural && (
        <div>
          <FieldLabel htmlFor={uid("linkRel")}>Link Relationship (XFN)</FieldLabel>
          <Input id={uid("linkRel")} value={draft.linkRel} onChange={(event) => set("linkRel", event.target.value)} placeholder="e.g., nofollow" />
        </div>
      )}

      {!isSeparator && (
        <div>
          <FieldLabel htmlFor={uid("description")}>Description</FieldLabel>
          <Textarea id={uid("description")} value={draft.description} onChange={(event) => set("description", event.target.value)} placeholder="Description (shown in some themes)" rows={2} className="min-h-0 text-xs" />
        </div>
      )}

      {/* Visibility */}
      <fieldset className="space-y-2 rounded-lg border border-border bg-card p-2.5">
        <legend className="flex items-center gap-1 px-1 text-[10px] font-medium text-foreground">
          <Eye className="size-3" aria-hidden="true" />
          Who sees this item
        </legend>
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor={uid("visibility")}>Visibility</FieldLabel>
            <SelectControl
              id={uid("visibility")}
              size="sm"
              value={draft.visibility}
              onValueChange={(value) => set("visibility", value)}
              options={MENU_VISIBILITY_OPTIONS.map((option) => ({ value: option.value, label: option.label, description: option.description }))}
              className="text-xs"
            />
          </div>
          <div>
            <FieldLabel htmlFor={uid("capability")}>Required capability</FieldLabel>
            <Input id={uid("capability")} value={draft.capability} onChange={(event) => set("capability", event.target.value)} placeholder="e.g. edit_posts" className="h-8 font-mono text-xs" />
          </div>
          <div>
            <FieldLabel htmlFor={uid("roles")}>Roles</FieldLabel>
            <ScopeMultiSelect
              id={uid("roles")}
              value={draft.roles}
              onChange={(next) => set("roles", next)}
              choices={roleChoices}
              placeholder="Any role"
              emptyMessage="No website roles yet."
              isLoading={scopeOptions === undefined}
            />
          </div>
          <div>
            <FieldLabel htmlFor={uid("plans")}>Membership plans</FieldLabel>
            <ScopeMultiSelect
              id={uid("plans")}
              value={draft.membershipPlans}
              onChange={(next) => set("membershipPlans", next)}
              choices={planChoices}
              placeholder="Any plan"
              emptyMessage="No membership plans (enable Membership to add some)."
              isLoading={scopeOptions === undefined}
            />
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground">Rules combine: a viewer must satisfy every rule you set. Children of a hidden item are hidden too.</p>
      </fieldset>

      <p className="text-[10px] text-muted-foreground">Original: {originalReference(item)}</p>

      <div className="flex items-center justify-between border-t border-border pt-1">
        <button type="button" onClick={() => onRemove(item._id)} className="flex items-center gap-1 text-[10px] text-destructive transition-colors hover:text-destructive/80">
          <Trash2Icon className="size-3" />
          Remove
        </button>
        <div className="flex items-center gap-2">
          <span className={saveStatus === "error" || hasErrors ? "text-[10px] text-destructive" : "text-[10px] text-muted-foreground"} aria-live="polite">
            {statusMessage()}
          </span>
          <Button variant="outline" size="xs" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}
