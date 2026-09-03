import { z } from "zod";

import {
  managementCapabilityCodeSchema,
  siteSessionRoleSlugSchema,
} from "./codes";

export const portableKeySchema = z
  .string()
  .trim()
  .min(8)
  .max(128)
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9._:-]*$/,
    "Portable keys may contain only letters, numbers, periods, underscores, colons, and hyphens",
  );

export function normalizeDeploymentOrigin(value: string): string {
  const url = new URL(value);

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Deployment origin must use http or https");
  }
  if (url.username || url.password) {
    throw new Error("Deployment origin must not contain credentials");
  }
  if (url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Deployment origin must not contain a path, query, or hash");
  }

  return url.origin;
}

export function normalizeSiteOrigin(value: string): string {
  return normalizeDeploymentOrigin(value);
}

export const deploymentOriginSchema = z
  .string()
  .transform((value, context) => {
    try {
      return normalizeDeploymentOrigin(value);
    } catch (error) {
      context.addIssue({
        code: "custom",
        message:
          error instanceof Error ? error.message : "Invalid deployment origin",
      });
      return z.NEVER;
    }
  });

export const environmentKindSchema = z.enum([
  "live",
  "staging",
  "beta",
  "preview",
  "development",
  "local",
  "custom",
]);

export type EnvironmentKind = z.infer<typeof environmentKindSchema>;

export const siteIdentitySchema = z
  .object({
    websiteKey: portableKeySchema,
    instanceKey: portableKeySchema,
    environmentKind: environmentKindSchema,
    deploymentOrigin: deploymentOriginSchema,
    managementOrigin: deploymentOriginSchema,
    siteOrigin: deploymentOriginSchema,
    siteContractVersion: z.string().min(1).max(64),
    schemaVersion: z.string().min(1).max(64),
    engineVersion: z.string().min(1).max(64),
    managementCapabilities: z
      .array(managementCapabilityCodeSchema)
      .min(1)
      .max(64),
  })
  .strict();

export type SiteIdentity = z.infer<typeof siteIdentitySchema>;

export const siteHealthResponseSchema = z
  .object({
    status: z.enum(["healthy", "degraded", "unhealthy"]),
    checkedAt: z.string().datetime({ offset: true }),
    websiteKey: portableKeySchema,
    instanceKey: portableKeySchema,
    siteContractVersion: z.string().min(1).max(64),
    schemaVersion: z.string().min(1).max(64),
    engineVersion: z.string().min(1).max(64),
    storageStatus: z.enum(["healthy", "degraded", "unhealthy", "unknown"]),
    authStatus: z.enum(["healthy", "degraded", "unhealthy", "unknown"]),
  })
  .strict();

export type SiteHealthResponse = z.infer<typeof siteHealthResponseSchema>;

export const siteSessionExchangeResponseSchema = z
  .object({
    token: z.string().min(64).max(16_384),
    controllerId: portableKeySchema,
    syntheticOperatorId: z.string().min(8).max(512),
    capabilities: z.array(managementCapabilityCodeSchema).min(1).max(64),
    siteRole: siteSessionRoleSlugSchema,
    siteCapabilities: z.array(z.string().min(1).max(160)).max(1_024),
    expiresAt: z.number().int().positive(),
  })
  .strict();

export type SiteSessionExchangeResponse = z.infer<
  typeof siteSessionExchangeResponseSchema
>;
