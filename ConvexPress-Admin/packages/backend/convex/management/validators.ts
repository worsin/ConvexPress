import { v } from "convex/values";

export const environmentKindValidator = v.union(
  v.literal("live"),
  v.literal("staging"),
  v.literal("beta"),
  v.literal("preview"),
  v.literal("development"),
  v.literal("local"),
  v.literal("custom"),
);

export const managementCapabilityValidator = v.union(
  v.literal("health.read"),
  v.literal("compatibility.read"),
  v.literal("site.register"),
  v.literal("site.attach"),
  v.literal("site.deploy"),
  v.literal("site.select"),
  v.literal("session.exchange"),
  v.literal("backup.create"),
  v.literal("site.clone"),
  v.literal("site.promote"),
  v.literal("site.restore"),
  v.literal("credential.rotate"),
  v.literal("authority.grant"),
  v.literal("authority.revoke"),
  v.literal("operation.resume"),
  v.literal("handoff.export"),
);

export const authorityStatusValidator = v.union(
  v.literal("active"),
  v.literal("revoked"),
);

export const managementEnvelopeValidator = v.object({
  contractVersion: v.string(),
  controllerId: v.string(),
  keyId: v.string(),
  websiteKey: v.string(),
  instanceKey: v.string(),
  operationCode: v.union(
    v.literal("site.health.check"),
    v.literal("site.compatibility.check"),
    v.literal("site.register"),
    v.literal("site.attach"),
    v.literal("site.engine.deploy"),
    v.literal("site.select"),
    v.literal("site.session.exchange"),
    v.literal("site.backup.create"),
    v.literal("site.clone"),
    v.literal("site.promote"),
    v.literal("site.restore"),
    v.literal("site.credential.rotate"),
    v.literal("site.authority.grant"),
    v.literal("site.authority.revoke"),
    v.literal("site.operation.resume"),
    v.literal("site.handoff.export"),
  ),
  bodyHash: v.string(),
  nonce: v.string(),
  issuedAt: v.string(),
  expiresAt: v.string(),
  idempotencyKey: v.optional(v.string()),
  signature: v.string(),
});
