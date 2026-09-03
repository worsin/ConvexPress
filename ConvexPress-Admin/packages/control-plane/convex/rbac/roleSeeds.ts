export interface MvpRoleDefinition {
  slug: string;
  name: string;
  description: string;
  level: number;
  type: "admin" | "operator" | "user";
  isDefault: boolean;
  status: "active";
  capabilities: readonly string[];
  pageAccess: readonly string[];
  sourceApp: "convexpress-control-plane";
}

export const MVP_ROLE_DEFINITIONS: readonly MvpRoleDefinition[] = [
  {
    slug: "owner",
    name: "Owner",
    description: "Installation owner with full control-plane authority.",
    level: 100,
    type: "admin",
    isDefault: false,
    status: "active",
    capabilities: ["*", "environment.live.operate"],
    pageAccess: ["*"],
    sourceApp: "convexpress-control-plane",
  },
  {
    slug: "admin",
    name: "Administrator",
    description: "Control-plane administrator with full operational authority.",
    level: 90,
    type: "admin",
    isDefault: false,
    status: "active",
    capabilities: ["*", "environment.live.operate"],
    pageAccess: ["*"],
    sourceApp: "convexpress-control-plane",
  },
  {
    slug: "business-manager",
    name: "Business Manager",
    description: "Manages explicitly assigned businesses and eligible child sites.",
    level: 70,
    type: "operator",
    isDefault: false,
    status: "active",
    capabilities: [
      "organization.read",
      "business.read",
      "business.update",
      "website.read",
      "website.update",
      "environment.read",
      "environment.nonlive.*",
      "connection.manage",
      "site.*",
    ],
    pageAccess: ["/businesses/*", "/sites/*"],
    sourceApp: "convexpress-control-plane",
  },
  {
    slug: "site-operator",
    name: "Site Operator",
    description: "Operates explicitly assigned websites and environments.",
    level: 60,
    type: "operator",
    isDefault: false,
    status: "active",
    capabilities: [
      "organization.read",
      "business.read",
      "website.read",
      "environment.read",
      "environment.nonlive.*",
      "connection.manage",
      "site.*",
    ],
    pageAccess: ["/sites/*"],
    sourceApp: "convexpress-control-plane",
  },
  {
    slug: "member",
    name: "Member",
    description: "Works within explicitly assigned sites using granted capabilities.",
    level: 40,
    type: "user",
    isDefault: true,
    status: "active",
    capabilities: [
      "organization.read",
      "business.read",
      "website.read",
      "environment.read",
      "site.read",
      "site.content.*",
    ],
    pageAccess: ["/sites/*"],
    sourceApp: "convexpress-control-plane",
  },
  {
    slug: "viewer",
    name: "Viewer",
    description: "Read-only access to explicitly assigned control-plane targets.",
    level: 20,
    type: "user",
    isDefault: false,
    status: "active",
    capabilities: [
      "organization.read",
      "business.read",
      "website.read",
      "environment.read",
      "site.read",
    ],
    pageAccess: ["/sites/*"],
    sourceApp: "convexpress-control-plane",
  },
] as const;
