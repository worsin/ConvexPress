import { z } from "zod";

export const MANAGEMENT_CAPABILITY_CODES = [
  "health.read",
  "compatibility.read",
  "site.register",
  "site.attach",
  "site.deploy",
  "site.select",
  "session.exchange",
  "backup.create",
  "site.clone",
  "site.promote",
  "site.restore",
  "credential.rotate",
  "authority.grant",
  "authority.revoke",
  "operation.resume",
  "handoff.export",
] as const;

export const managementCapabilityCodeSchema = z.enum(
  MANAGEMENT_CAPABILITY_CODES,
);

export type ManagementCapabilityCode = z.infer<
  typeof managementCapabilityCodeSchema
>;

export const SITE_SESSION_ROLE_SLUGS = [
  "administrator",
  "editor",
  "author",
  "contributor",
  "subscriber",
] as const;

export const siteSessionRoleSlugSchema = z.enum(SITE_SESSION_ROLE_SLUGS);

export type SiteSessionRoleSlug = z.infer<typeof siteSessionRoleSlugSchema>;

export const OPERATION_CODES = {
  healthCheck: "site.health.check",
  compatibilityCheck: "site.compatibility.check",
  register: "site.register",
  attach: "site.attach",
  deploy: "site.engine.deploy",
  select: "site.select",
  sessionExchange: "site.session.exchange",
  backupCreate: "site.backup.create",
  clone: "site.clone",
  promote: "site.promote",
  restore: "site.restore",
  credentialRotate: "site.credential.rotate",
  authorityGrant: "site.authority.grant",
  authorityRevoke: "site.authority.revoke",
  operationResume: "site.operation.resume",
  handoffExport: "site.handoff.export",
} as const;

export const OPERATION_CODE_VALUES = Object.values(OPERATION_CODES);

export const operationCodeSchema = z.enum(OPERATION_CODE_VALUES);

export type OperationCode = z.infer<typeof operationCodeSchema>;

export const OPERATION_CAPABILITY: Readonly<
  Record<OperationCode, ManagementCapabilityCode>
> = {
  [OPERATION_CODES.healthCheck]: "health.read",
  [OPERATION_CODES.compatibilityCheck]: "compatibility.read",
  [OPERATION_CODES.register]: "site.register",
  [OPERATION_CODES.attach]: "site.attach",
  [OPERATION_CODES.deploy]: "site.deploy",
  [OPERATION_CODES.select]: "site.select",
  [OPERATION_CODES.sessionExchange]: "session.exchange",
  [OPERATION_CODES.backupCreate]: "backup.create",
  [OPERATION_CODES.clone]: "site.clone",
  [OPERATION_CODES.promote]: "site.promote",
  [OPERATION_CODES.restore]: "site.restore",
  [OPERATION_CODES.credentialRotate]: "credential.rotate",
  [OPERATION_CODES.authorityGrant]: "authority.grant",
  [OPERATION_CODES.authorityRevoke]: "authority.revoke",
  [OPERATION_CODES.operationResume]: "operation.resume",
  [OPERATION_CODES.handoffExport]: "handoff.export",
};
