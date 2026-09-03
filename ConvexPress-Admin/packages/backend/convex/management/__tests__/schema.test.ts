import { describe, expect, test } from "bun:test";

import { managementTables } from "../../schema/management";

type InspectableTable = {
  indexes: Array<{ indexDescriptor: string; fields: string[] }>;
  validator: { fields: Record<string, unknown> };
};

function fields(table: unknown): string[] {
  return Object.keys((table as InspectableTable).validator.fields).sort();
}

function indexes(table: unknown): string[] {
  return (table as InspectableTable).indexes
    .map((index) => `${index.indexDescriptor}:${index.fields.join(",")}`)
    .sort();
}

describe("site-local management schema", () => {
  test("keeps the outer controller out of site-local content tables", () => {
    expect(Object.keys(managementTables).sort()).toEqual([
      "convexpress_managementAuthorities",
      "convexpress_managementBindings",
      "convexpress_managementNonces",
      "convexpress_managementSessions",
      "convexpress_siteIdentity",
    ]);
    for (const table of Object.values(managementTables)) {
      expect(fields(table)).not.toContain("organization_id");
      expect(fields(table)).not.toContain("business_id");
      expect(fields(table)).not.toContain("site_id");
    }
  });

  test("binds identity, public authorities, replay protection, and sessions", () => {
    expect(fields(managementTables.convexpress_siteIdentity)).toEqual(
      expect.arrayContaining([
        "deploymentOrigin",
        "engineVersion",
        "environmentKind",
        "instanceKey",
        "managementOrigin",
        "managementCapabilities",
        "schemaVersion",
        "siteContractVersion",
        "siteOrigin",
        "websiteKey",
      ]),
    );
    expect(fields(managementTables.convexpress_managementAuthorities)).toEqual(
      expect.arrayContaining([
        "capabilities",
        "capabilityRevision",
        "controllerId",
        "fingerprintSha256",
        "instanceKey",
        "keyId",
        "publicKeyPem",
        "status",
        "websiteKey",
      ]),
    );
    expect(fields(managementTables.convexpress_managementAuthorities)).not.toContain(
      "privateKeyPem",
    );
    expect(indexes(managementTables.convexpress_managementAuthorities)).toContain(
      "by_controller_key:controllerId,keyId",
    );
    expect(indexes(managementTables.convexpress_managementNonces)).toContain(
      "by_authority_nonce:authorityId,nonce",
    );
    expect(indexes(managementTables.convexpress_managementSessions)).toContain(
      "by_token_hash:tokenHash",
    );
  });
});
