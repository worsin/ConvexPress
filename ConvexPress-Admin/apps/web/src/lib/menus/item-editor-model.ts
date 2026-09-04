/**
 * Menu builder — item editor model (pure).
 *
 * Maps a stored menu item to the editor draft, normalizes the draft back into
 * the `updateMenuItem` payload, and describes visibility rules for the card.
 * Kept free of React so it is unit tested with `bun test`.
 */

import {
  BADGE_SOURCES,
  type DashboardBadgeSource,
} from "@backend/convex/extensions/dashboard/registry";

import type { MenuItem, MenuItemType, MenuVisibility } from "@/components/menus/types";

export const MENU_ITEM_TYPE_LABELS: Record<MenuItemType, string> = {
  page: "Page",
  post: "Post",
  category: "Category",
  tag: "Tag",
  custom: "Custom Link",
  dashboard: "Dashboard page",
  heading: "Heading",
  separator: "Separator",
};

export const BADGE_SOURCE_LABELS: Record<DashboardBadgeSource, string> = {
  "notifications.unread": "Unread notifications",
  "tickets.awaitingYou": "Tickets awaiting your reply",
  "orders.active": "Active orders",
  "cart.items": "Items in cart",
  "courses.inProgress": "Courses in progress",
};

export function badgeSourceLabel(source: string | undefined): string {
  if (!source) return "";
  return (BADGE_SOURCE_LABELS as Record<string, string>)[source] ?? source;
}

export const BADGE_SOURCE_OPTIONS: Array<{ value: DashboardBadgeSource; label: string }> = BADGE_SOURCES.map(
  (source) => ({ value: source, label: BADGE_SOURCE_LABELS[source] }),
);

export const MENU_VISIBILITY_OPTIONS: Array<{ value: MenuVisibility; label: string; description: string }> = [
  { value: "everyone", label: "Everyone", description: "Visitors and members alike." },
  { value: "signedIn", label: "Signed in", description: "Only members who are logged in." },
  { value: "signedOut", label: "Signed out", description: "Only visitors who are not logged in." },
];

/** Same rule the backend applies to pathOverride. */
export const PATH_OVERRIDE_PATTERN = /^\/[a-z0-9-]+(?:\/[a-z0-9-]+)*$/u;

export function validatePathOverride(path: string): string | null {
  const trimmed = path.trim();
  if (!trimmed) return null;
  if (!PATH_OVERRIDE_PATTERN.test(trimmed)) {
    return "Use a lowercase path like /account — no trailing slash.";
  }
  return null;
}

export function isStructuralItem(type: MenuItemType): boolean {
  return type === "heading" || type === "separator";
}

export function isLinkItem(type: MenuItemType): boolean {
  return !isStructuralItem(type);
}

export interface MenuItemDraft {
  label: string;
  title: string;
  cssClasses: string;
  openInNewTab: boolean;
  linkRel: string;
  description: string;
  url: string;
  icon: string;
  badge: string;
  pathOverride: string;
  visibility: MenuVisibility;
  roles: string[];
  membershipPlans: string[];
  capability: string;
}

export function createMenuItemDraft(item: MenuItem): MenuItemDraft {
  return {
    label: item.label,
    title: item.title ?? "",
    cssClasses: item.cssClasses ?? "",
    openInNewTab: item.target === "_blank",
    linkRel: item.linkRel ?? "",
    description: item.description ?? "",
    url: item.url ?? "",
    icon: item.icon ?? "",
    badge: item.badge ?? "",
    pathOverride: item.pathOverride ?? "",
    visibility: item.visibility ?? "everyone",
    roles: [...(item.roles ?? [])],
    membershipPlans: [...(item.membershipPlans ?? [])],
    capability: item.capability ?? "",
  };
}

/** Trimmed, type-aware draft — the shape that is compared and sent. */
export interface NormalizedMenuItemDraft {
  label: string;
  title?: string;
  cssClasses?: string;
  target: "_self" | "_blank";
  linkRel?: string;
  description?: string;
  url?: string;
  icon: string;
  badge: string;
  pathOverride?: string;
  visibility: MenuVisibility;
  roles: string[];
  membershipPlans: string[];
  capability: string;
}

export function normalizeMenuItemDraft(draft: MenuItemDraft, itemType: MenuItemType): NormalizedMenuItemDraft {
  const structural = isStructuralItem(itemType);
  return {
    label: itemType === "separator" ? draft.label.trim() || "Separator" : draft.label.trim(),
    title: structural ? undefined : draft.title.trim() || undefined,
    cssClasses: draft.cssClasses.trim() || undefined,
    target: !structural && draft.openInNewTab ? "_blank" : "_self",
    linkRel: structural ? undefined : draft.linkRel.trim() || undefined,
    description: draft.description.trim() || undefined,
    url: itemType === "custom" ? draft.url.trim() || undefined : undefined,
    icon: structural && itemType === "separator" ? "" : draft.icon.trim(),
    badge: structural ? "" : draft.badge.trim(),
    pathOverride: itemType === "dashboard" ? draft.pathOverride.trim() : undefined,
    visibility: draft.visibility,
    roles: dedupe(draft.roles.map((role) => role.trim()).filter(Boolean)),
    membershipPlans: dedupe(draft.membershipPlans.map((plan) => plan.trim()).filter(Boolean)),
    capability: draft.capability.trim(),
  };
}

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values));
}

export function draftSignature(normalized: NormalizedMenuItemDraft): string {
  return JSON.stringify(normalized);
}

/** Validation errors that block autosave. */
export function validateMenuItemDraft(
  normalized: NormalizedMenuItemDraft,
  itemType: MenuItemType,
): Partial<Record<keyof MenuItemDraft, string>> {
  const errors: Partial<Record<keyof MenuItemDraft, string>> = {};
  if (itemType !== "separator" && !normalized.label) errors.label = "Label is required";
  if (itemType === "custom" && !normalized.url) errors.url = "URL is required";
  if (itemType === "dashboard" && normalized.pathOverride) {
    const error = validatePathOverride(normalized.pathOverride);
    if (error) errors.pathOverride = error;
  }
  if (normalized.icon && !/^[a-z0-9-]{1,64}$/u.test(normalized.icon)) {
    errors.icon = "Icon must be a lucide icon name such as shopping-bag";
  }
  return errors;
}

/** Arguments for menus.mutations.updateMenuItem. Empty strings clear a value. */
export function buildMenuItemUpdateArgs(
  normalized: NormalizedMenuItemDraft,
  item: Pick<MenuItem, "_id" | "itemType">,
): Record<string, unknown> {
  return {
    itemId: item._id,
    label: normalized.label,
    title: normalized.title,
    cssClasses: normalized.cssClasses,
    target: normalized.target,
    linkRel: normalized.linkRel,
    description: normalized.description,
    ...(item.itemType === "custom" ? { url: normalized.url } : {}),
    icon: normalized.icon,
    badge: normalized.badge,
    ...(item.itemType === "dashboard" ? { pathOverride: normalized.pathOverride ?? "" } : {}),
    visibility: normalized.visibility,
    roles: normalized.roles,
    membershipPlans: normalized.membershipPlans,
    capability: normalized.capability,
  };
}

export function hasVisibilityRules(
  item: Pick<MenuItem, "visibility" | "roles" | "membershipPlans" | "capability">,
): boolean {
  return Boolean(
    (item.visibility && item.visibility !== "everyone") ||
      (item.roles && item.roles.length > 0) ||
      (item.membershipPlans && item.membershipPlans.length > 0) ||
      (item.capability && item.capability.trim()),
  );
}

export function visibilitySummary(
  item: Pick<MenuItem, "visibility" | "roles" | "membershipPlans" | "capability">,
): string {
  const parts: string[] = [];
  if (item.visibility === "signedIn") parts.push("Signed-in members only");
  if (item.visibility === "signedOut") parts.push("Signed-out visitors only");
  if (item.roles && item.roles.length > 0) parts.push(`Roles: ${item.roles.join(", ")}`);
  if (item.membershipPlans && item.membershipPlans.length > 0) parts.push(`Plans: ${item.membershipPlans.join(", ")}`);
  if (item.capability) parts.push(`Requires ${item.capability}`);
  return parts.join(" · ");
}

/** Human-readable "Original:" line under the editor. */
export function originalReference(item: Pick<MenuItem, "itemType" | "url" | "label" | "objectId">): string {
  switch (item.itemType) {
    case "custom":
      return `Custom URL: ${item.url ?? ""}`;
    case "dashboard":
      return `Dashboard page: ${item.objectId ?? ""}`;
    case "heading":
      return "Section heading (not a link)";
    case "separator":
      return "Visual divider (not a link)";
    default:
      return `${MENU_ITEM_TYPE_LABELS[item.itemType]}: ${item.label}`;
  }
}
