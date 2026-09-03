import { describe, expect, test } from "bun:test";

import { authTables } from "../schema/auth";
import { rbacTables } from "../schema/rbac";
import { serverBootstrapTables } from "../schema/serverBootstrap";
import { userProfileTables } from "../schema/userProfiles";
import { hierarchyTables } from "../schema/hierarchy";
import { connectionTables } from "../schema/connections";
import { lifecycleTables } from "../schema/lifecycle";

type InspectableTable = {
  indexes: Array<{ indexDescriptor: string; fields: string[] }>;
  validator: { fields: Record<string, unknown> };
};

function fieldNames(table: unknown): string[] {
  return Object.keys((table as InspectableTable).validator.fields).sort();
}

function indexShape(table: unknown): string[] {
  return (table as InspectableTable).indexes
    .map((index) => `${index.indexDescriptor}:${index.fields.join(",")}`)
    .sort();
}

describe("donor-exact outer identity and RBAC schema", () => {
  test("declares every required table with the current VO names", () => {
    expect(Object.keys({ ...authTables, ...rbacTables }).sort()).toEqual([
      "overseer_accessPresets",
      "overseer_permissions",
      "overseer_roleAssignments",
      "overseer_roles",
      "overseer_users",
    ]);
  });

  test("keeps the VO overseer_users field and index contract", () => {
    expect(fieldNames(authTables.overseer_users)).toEqual([
      "authUserId",
      "avatarMediaAssetId",
      "avatarMediaUsageRefId",
      "avatarUrl",
      "bio",
      "clerkId",
      "createdAt",
      "createdBy",
      "email",
      "emailVerificationTime",
      "handle",
      "image",
      "isActive",
      "isAnonymous",
      "lastLoginAt",
      "name",
      "phone",
      "phoneVerificationTime",
      "preferences",
      "role",
      "title",
      "updatedAt",
      "username",
    ]);
    expect(indexShape(authTables.overseer_users)).toEqual([
      "by_active:isActive",
      "by_auth_user:authUserId",
      "by_clerk_id:clerkId",
      "by_role:role",
      "by_username:username",
      "email:email",
      "phone:phone",
    ]);
  });

  test("keeps role, assignment, permission, and preset indexes stable", () => {
    expect(indexShape(rbacTables.overseer_roles)).toEqual([
      "by_slug:slug",
      "by_status:status",
      "by_type:type",
    ]);
    expect(indexShape(rbacTables.overseer_roleAssignments)).toEqual([
      "by_app:app_id",
      "by_role:roleId",
      "by_status:status",
      "by_subject:subjectType,subjectId",
      "by_subject_app:subjectType,subjectId,app_id",
      "by_user:userId",
      "by_user_app:userId,app_id",
      "by_user_business:userId,businessId",
    ]);
    expect(indexShape(rbacTables.overseer_permissions)).toEqual([
      "by_action:actionCode",
      "by_role_action:roleSlug,actionCode",
      "by_selector:selectorType,selectorCode",
      "by_source_app:sourceAppId",
      "by_subject:subjectType,subjectId",
      "by_subject_selector:subjectType,subjectId,selectorType,selectorCode",
    ]);
    expect(indexShape(rbacTables.overseer_accessPresets)).toEqual([
      "by_department_code:departmentCode",
      "by_kind:kind",
      "by_magic_record:magicTablesRecordId",
      "by_role_slug:defaultRoleSlug",
      "by_source_app:sourceAppId",
      "by_status:status",
    ]);
  });

  test("retains the VO profile and guarded first-owner reservation support", () => {
    expect(Object.keys(userProfileTables)).toEqual(["overseer_userProfiles"]);
    expect(indexShape(userProfileTables.overseer_userProfiles)).toEqual([
      "by_user:userId",
    ]);
    expect(fieldNames(userProfileTables.overseer_userProfiles)).toContain(
      "activeWebsiteInstanceId",
    );
    expect(Object.keys(serverBootstrapTables)).toEqual([
      "overseer_serverBootstrapReservations",
    ]);
    expect(
      indexShape(serverBootstrapTables.overseer_serverBootstrapReservations),
    ).toEqual([
      "by_reservationId:reservationId",
      "by_reservationKey:reservationKey",
    ]);
  });

  test("declares the standalone hierarchy and direct-access table contract", () => {
    expect(Object.keys(hierarchyTables).sort()).toEqual([
      "overseer_businessAccess",
      "overseer_businesses",
      "overseer_organizationAccess",
      "overseer_organizations",
      "overseer_websiteAccess",
      "overseer_websiteInstances",
      "overseer_websites",
    ]);
    expect(indexShape(hierarchyTables.overseer_websites)).toContain(
      "by_website_key:websiteKey",
    );
    expect(fieldNames(hierarchyTables.overseer_websiteInstances)).toEqual(
      expect.arrayContaining([
        "connection_id",
        "deploymentOrigin",
        "engineVersion",
        "instanceKey",
        "kind",
        "managementOrigin",
        "schemaVersion",
        "siteContractVersion",
        "siteOrigin",
        "website_id",
      ]),
    );
    expect(indexShape(hierarchyTables.overseer_websiteInstances)).toContain(
      "by_instance_key:instanceKey",
    );
    expect(indexShape(hierarchyTables.overseer_websiteInstances)).toContain(
      "by_management_origin:managementOrigin",
    );
    expect(indexShape(hierarchyTables.overseer_websiteInstances)).toContain(
      "by_site_origin:siteOrigin",
    );
    expect(indexShape(hierarchyTables.overseer_websiteAccess)).toEqual([
      "by_subject:subjectType,subjectId",
      "by_subject_website:subjectType,subjectId,websiteId",
      "by_website:websiteId",
    ]);
  });

  test("stores only encrypted connection envelopes with target attribution", () => {
    expect(Object.keys(connectionTables).sort()).toEqual([
      "overseer_connectionHealthHistory",
      "overseer_connections",
    ]);
    expect(fieldNames(connectionTables.overseer_connections)).toEqual(
      expect.arrayContaining([
        "business_id",
        "credentials",
        "instance_id",
        "organization_id",
        "website_id",
      ]),
    );
    expect(fieldNames(connectionTables.overseer_connections)).not.toContain(
      "oauthTokens",
    );
    expect(indexShape(connectionTables.overseer_connections)).toContain(
      "by_instance:instance_id,isActive",
    );
  });

  test("declares durable lifecycle, backup, receipt, and handoff records", () => {
    expect(Object.keys(lifecycleTables).sort()).toEqual([
      "overseer_operationReceipts",
      "overseer_operationSteps",
      "overseer_siteBackups",
      "overseer_siteHandoffs",
      "overseer_siteOperations",
    ]);
    expect(indexShape(lifecycleTables.overseer_siteOperations)).toEqual(
      expect.arrayContaining([
        "by_idempotency:idempotencyKey",
        "by_instance_state:instanceId,state",
        "by_operation_key:operationKey",
      ]),
    );
    expect(fieldNames(lifecycleTables.overseer_siteOperations)).toEqual(
      expect.arrayContaining([
        "idempotencyKey",
        "instanceId",
        "instanceKey",
        "operationCode",
        "operationKey",
        "requestedByUserId",
        "revision",
        "state",
        "websiteId",
        "websiteKey",
      ]),
    );
    expect(indexShape(lifecycleTables.overseer_siteBackups)).toContain(
      "by_snapshot_id:snapshotId",
    );
    expect(indexShape(lifecycleTables.overseer_operationReceipts)).toContain(
      "by_receipt_id:receiptId",
    );
  });
});
