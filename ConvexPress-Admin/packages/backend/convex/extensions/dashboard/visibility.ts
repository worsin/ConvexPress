/**
 * Menu visibility rules — pure, shared by the menu query (server) and the
 * admin builder preview (client).
 *
 * A menu item may declare who sees it:
 *   visibility       everyone | signedIn | signedOut
 *   roles            website role slugs (any match)
 *   membershipPlans  membership plan slugs (any match)
 *   capability       website capability the viewer must hold
 * Items linked to a plugin page are additionally hidden when that plugin is
 * disabled. Children of a hidden item are hidden with it.
 */

export type MenuVisibility = "everyone" | "signedIn" | "signedOut";

export interface MenuViewer {
  signedIn: boolean;
  roleSlug: string | null;
  planSlugs: string[];
  capabilities: string[];
}

export interface MenuVisibilityRules {
  visibility?: MenuVisibility | null;
  roles?: string[] | null;
  membershipPlans?: string[] | null;
  capability?: string | null;
}

export const ANONYMOUS_VIEWER: MenuViewer = {
  signedIn: false,
  roleSlug: null,
  planSlugs: [],
  capabilities: [],
};

export function menuItemVisibleFor(rules: MenuVisibilityRules, viewer: MenuViewer): boolean {
  const visibility = rules.visibility ?? "everyone";
  if (visibility === "signedIn" && !viewer.signedIn) return false;
  if (visibility === "signedOut" && viewer.signedIn) return false;
  if (rules.roles && rules.roles.length > 0) {
    if (!viewer.roleSlug || !rules.roles.includes(viewer.roleSlug)) return false;
  }
  if (rules.membershipPlans && rules.membershipPlans.length > 0) {
    if (!rules.membershipPlans.some((plan) => viewer.planSlugs.includes(plan))) return false;
  }
  if (rules.capability && !viewer.capabilities.includes(rules.capability)) return false;
  return true;
}
