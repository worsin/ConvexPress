"use node";

import {
  createUnsignedManagementEnvelope,
  CURRENT_SITE_CONTRACT_VERSION,
  OPERATION_CODES,
  siteSessionExchangeResponseSchema,
} from "@convexpress/site-contract";
import { signManagementEnvelope } from "@convexpress/site-contract/node";

export interface AuthorityProbeCredential {
  controllerId: string;
  keyId: string;
  privateKeyPem: string;
  capabilities: readonly string[];
}

export interface AuthorityProbeTarget {
  managementOrigin: string;
  websiteKey: string;
  instanceKey: string;
  controllerSubjectId: string;
}

type FetchImplementation = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export async function probeControllerAuthority(
  input: AuthorityProbeTarget & {
    credential: AuthorityProbeCredential;
    fetchImpl?: FetchImplementation;
    now?: number;
    nonce?: string;
  },
) {
  if (
    !input.credential.capabilities.includes("health.read") ||
    !input.credential.capabilities.includes("session.exchange")
  ) {
    throw new Error("Controller authority probe failed");
  }

  const now = input.now ?? Date.now();
  const nonce =
    input.nonce ??
    `probe_${crypto.randomUUID().replaceAll("-", "")}`;
  const body = {
    requestedCapabilities: ["health.read"],
    requestedSiteRole: "subscriber",
    controllerSubjectId: input.controllerSubjectId,
  };
  const envelope = signManagementEnvelope(
    createUnsignedManagementEnvelope({
      contractVersion: CURRENT_SITE_CONTRACT_VERSION,
      controllerId: input.credential.controllerId,
      keyId: input.credential.keyId,
      websiteKey: input.websiteKey,
      instanceKey: input.instanceKey,
      operationCode: OPERATION_CODES.sessionExchange,
      body,
      nonce,
      issuedAt: new Date(now - 500).toISOString(),
      expiresAt: new Date(now + 60_000).toISOString(),
      idempotencyKey: `authority_${nonce}`,
    }),
    input.credential.privateKeyPem,
  );

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  let response: Response;
  try {
    response = await (input.fetchImpl ?? fetch)(
      `${input.managementOrigin}/api/convexpress/management/session/exchange`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ envelope, body }),
        signal: controller.signal,
      },
    );
  } catch {
    throw new Error("Controller authority probe failed");
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) throw new Error("Controller authority probe failed");
  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > 65_536) {
    throw new Error("Controller authority probe failed");
  }
  try {
    const session = siteSessionExchangeResponseSchema.parse(
      await response.json(),
    );
    if (
      session.controllerId !== input.credential.controllerId ||
      session.siteRole !== "subscriber" ||
      session.capabilities.length !== 1 ||
      session.capabilities[0] !== "health.read" ||
      session.expiresAt <= now
    ) {
      throw new Error("invalid probe response");
    }
    return session;
  } catch {
    throw new Error("Controller authority probe failed");
  }
}
