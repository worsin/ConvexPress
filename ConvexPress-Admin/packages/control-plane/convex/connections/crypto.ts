"use node";

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

export interface CredentialEnvelope {
  encrypted: string;
  iv: string;
  authTag: string;
  createdAt: number;
  updatedAt: number;
  lastRotatedAt: number;
  version: number;
}

function assertKey(key: Uint8Array): Buffer {
  if (key.byteLength !== 32) {
    throw new Error("Connection encryption key must contain exactly 32 bytes");
  }
  return Buffer.from(key);
}

export function encryptCredentialPayload(input: {
  payload: Record<string, unknown>;
  key: Uint8Array;
  keyVersion: number;
  aad: string;
  now?: number;
}): CredentialEnvelope {
  if (!Number.isSafeInteger(input.keyVersion) || input.keyVersion < 1) {
    throw new Error("Connection key version must be a positive integer");
  }
  const key = assertKey(input.key);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(input.aad, "utf8"));
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(input.payload), "utf8"),
    cipher.final(),
  ]);
  const now = input.now ?? Date.now();
  return {
    encrypted: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    createdAt: now,
    updatedAt: now,
    lastRotatedAt: now,
    version: input.keyVersion,
  };
}

export function decryptCredentialPayload(input: {
  envelope: CredentialEnvelope;
  key: Uint8Array;
  aad: string;
}): Record<string, unknown> {
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      assertKey(input.key),
      Buffer.from(input.envelope.iv, "base64"),
    );
    decipher.setAAD(Buffer.from(input.aad, "utf8"));
    decipher.setAuthTag(Buffer.from(input.envelope.authTag, "base64"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(input.envelope.encrypted, "base64")),
      decipher.final(),
    ]).toString("utf8");
    const parsed = JSON.parse(plaintext);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("invalid payload");
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new Error("Connection credentials could not be decrypted");
  }
}

export function parseEnvelopeKeys(input: {
  serializedKeys: string | undefined;
  activeVersion: string | undefined;
}) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input.serializedKeys ?? "");
  } catch {
    throw new Error("Connection envelope keys are not configured");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Connection envelope keys are not configured");
  }
  const activeVersion = Number(input.activeVersion);
  if (!Number.isSafeInteger(activeVersion) || activeVersion < 1) {
    throw new Error("Active connection envelope key version is invalid");
  }
  const encoded = (parsed as Record<string, unknown>)[String(activeVersion)];
  if (typeof encoded !== "string") {
    throw new Error("Active connection envelope key is unavailable");
  }
  const key = Buffer.from(encoded, "base64");
  assertKey(key);
  return { activeVersion, key };
}

export function parseEnvelopeKey(
  serializedKeys: string | undefined,
  keyVersion: number,
) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serializedKeys ?? "");
  } catch {
    throw new Error("Connection envelope keys are not configured");
  }
  const encoded =
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)[String(keyVersion)]
      : undefined;
  if (typeof encoded !== "string") {
    throw new Error("Connection envelope key is unavailable");
  }
  const key = Buffer.from(encoded, "base64");
  assertKey(key);
  return key;
}
