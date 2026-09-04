/** Layout scopes: "default" | "role:<slug>" | "plan:<slug>" (pure helpers). */

export interface ScopeOptions {
  roles: Array<{ slug: string; name: string; type: string }>;
  plans: Array<{ slug: string; name: string }>;
}

export type ScopeKind = "default" | "role" | "plan";

export const SCOPE_PATTERN = /^(default|(role|plan):[a-z0-9-]{1,64})$/u;

export function isValidScope(scope: string): boolean {
  return SCOPE_PATTERN.test(scope);
}

export function describeScope(scope: string, options?: ScopeOptions | null): { kind: ScopeKind; name: string; slug: string } {
  if (scope === "default") return { kind: "default", name: "Everyone", slug: "default" };
  const [kind, slug = ""] = scope.split(":", 2);
  if (kind === "role") return { kind: "role", name: options?.roles.find((role) => role.slug === slug)?.name ?? slug, slug };
  if (kind === "plan") return { kind: "plan", name: options?.plans.find((plan) => plan.slug === slug)?.name ?? slug, slug };
  return { kind: "default", name: scope, slug: scope };
}

/** Title suggested for a brand-new scoped layout. */
export function defaultLayoutTitle(scope: string, options?: ScopeOptions | null): string {
  const described = describeScope(scope, options);
  if (described.kind === "default") return "Everyone";
  return described.kind === "role" ? `${described.name} members` : `${described.name} plan`;
}
