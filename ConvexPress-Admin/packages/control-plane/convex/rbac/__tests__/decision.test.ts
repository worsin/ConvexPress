import { describe, expect, test } from "bun:test";

import {
  resolveAccessDecision,
  type AccessDecisionInput,
  type RoleDefinition,
} from "../decision";

const NOW = Date.parse("2026-09-02T18:00:00.000Z");
const ROLES: RoleDefinition[] = [
  {
    slug: "business-manager",
    status: "active",
    capabilityCodes: ["business.read", "site.*"],
    routePaths: ["/sites", "/sites/*"],
  },
  {
    slug: "site-operator",
    status: "active",
    capabilityCodes: ["site.read", "site.content.*"],
    routePaths: ["/site", "/site/*"],
  },
  {
    slug: "member",
    status: "active",
    capabilityCodes: ["site.read", "site.content.read"],
    routePaths: ["/site", "/site/content"],
  },
  {
    slug: "viewer",
    status: "active",
    capabilityCodes: ["site.read"],
    routePaths: ["/site"],
  },
];

function base(overrides: Partial<AccessDecisionInput> = {}): AccessDecisionInput {
  return {
    now: NOW,
    actor: {
      userId: "user-1",
      status: "active",
      platformRole: "member",
    },
    request: {
      selector: { type: "capability", code: "site.read" },
      target: {
        organizationId: "org-1",
        businessId: "business-1",
        websiteId: "website-1",
        instanceId: "instance-live-1",
      },
    },
    assignments: [],
    permissions: [],
    roles: ROLES,
    ...overrides,
  };
}

describe("outer deny-wins access decision", () => {
  test.each(["owner", "admin"] as const)(
    "%s has platform access without a subordinate assignment",
    (platformRole) => {
      expect(
        resolveAccessDecision(
          base({
            actor: { userId: "user-1", status: "active", platformRole },
          }),
        ),
      ).toMatchObject({
        allowed: true,
        reason: "platform_administrator",
        winningRuleId: `platform-role:${platformRole}`,
      });
    },
  );

  test.each([
    ["business-manager", "business", "assignment-business"],
    ["site-operator", "website", "assignment-site-operator"],
    ["member", "website", "assignment-member"],
    ["viewer", "environment", "assignment-viewer"],
  ] as const)(
    "%s receives only its explicit %s reachability",
    (roleSlug, targetType, assignmentId) => {
      const targetId =
        targetType === "business"
          ? "business-1"
          : targetType === "website"
            ? "website-1"
            : "instance-live-1";
      const decision = resolveAccessDecision(
        base({
          assignments: [
            {
              assignmentId,
              userId: "user-1",
              roleSlug,
              status: "active",
              target: { type: targetType, id: targetId },
              includeChildren: targetType !== "environment",
            },
          ],
        }),
      );
      expect(decision).toMatchObject({
        allowed: true,
        reason: "role_assignment",
        winningRuleId: assignmentId,
        roleSlug,
      });
    },
  );

  test("inactive and expired assignments fail closed", () => {
    for (const status of ["inactive", "revoked", "expired"] as const) {
      expect(
        resolveAccessDecision(
          base({
            assignments: [
              {
                assignmentId: `assignment-${status}`,
                userId: "user-1",
                roleSlug: "site-operator",
                status,
                target: { type: "website", id: "website-1" },
                includeChildren: true,
              },
            ],
          }),
        ),
      ).toMatchObject({ allowed: false, reason: "no_matching_grant" });
    }
  });

  test("a matching explicit deny wins over platform and role allows", () => {
    expect(
      resolveAccessDecision(
        base({
          actor: { userId: "user-1", status: "active", platformRole: "owner" },
          permissions: [
            {
              permissionId: "permission-deny-live-delete",
              effect: "deny",
              status: "active",
              subject: { type: "user", id: "user-1" },
              selector: { type: "capability", code: "site.read" },
              target: { type: "environment", id: "instance-live-1" },
            },
          ],
        }),
      ),
    ).toEqual({
      allowed: false,
      reason: "explicit_deny",
      winningRuleId: "permission-deny-live-delete",
      roleSlug: null,
    });
  });

  test("ignores inactive, future, and expired permission rows", () => {
    expect(
      resolveAccessDecision(
        base({
          permissions: [
            {
              permissionId: "permission-inactive",
              effect: "allow",
              status: "inactive",
              subject: { type: "user", id: "user-1" },
              selector: { type: "all" },
            },
            {
              permissionId: "permission-future",
              effect: "allow",
              status: "active",
              subject: { type: "user", id: "user-1" },
              selector: { type: "all" },
              effectiveAt: NOW + 1,
            },
            {
              permissionId: "permission-expired",
              effect: "allow",
              status: "active",
              subject: { type: "user", id: "user-1" },
              selector: { type: "all" },
              expiresAt: NOW,
            },
          ],
        }),
      ),
    ).toMatchObject({ allowed: false, reason: "no_matching_grant" });
  });

  test("does not trust forged subjects or sibling targets", () => {
    const result = resolveAccessDecision(
      base({
        assignments: [
          {
            assignmentId: "assignment-sibling-business",
            userId: "user-1",
            roleSlug: "business-manager",
            status: "active",
            target: { type: "business", id: "business-2" },
            includeChildren: true,
          },
        ],
        permissions: [
          {
            permissionId: "permission-other-user",
            effect: "allow",
            status: "active",
            subject: { type: "user", id: "forged-user-id" },
            selector: { type: "all" },
          },
        ],
      }),
    );
    expect(result).toEqual({
      allowed: false,
      reason: "no_matching_grant",
      winningRuleId: null,
      roleSlug: null,
    });
  });

  test("returns the exact positive permission that wins", () => {
    expect(
      resolveAccessDecision(
        base({
          permissions: [
            {
              permissionId: "permission-direct-site-read",
              effect: "allow",
              status: "active",
              subject: { type: "user", id: "user-1" },
              selector: { type: "capability", code: "site.read" },
              target: { type: "website", id: "website-1" },
              includeChildren: true,
            },
          ],
        }),
      ),
    ).toEqual({
      allowed: true,
      reason: "explicit_allow",
      winningRuleId: "permission-direct-site-read",
      roleSlug: null,
    });
  });
});
