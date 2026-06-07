/**
 * Auth System - JWT Signing & Password Utilities
 *
 * These functions are called exclusively from HTTP actions (Node.js runtime),
 * which gives them access to process.env and Web Crypto APIs.
 *
 * NEVER import this file from Convex queries/mutations — they run in a
 * different runtime and cannot access process.env.
 */

import { importPKCS8, exportJWK, SignJWT } from "jose";
import bcrypt from "bcryptjs";

const ALG = "ES256";
const ISSUER = "https://convexpress-admin.local";
const AUDIENCE = "convexpress-admin";
const ACCESS_TOKEN_EXPIRY = "15m";
const REFRESH_TOKEN_BYTES = 32;
const BCRYPT_COST = 12;

// ─── Access Token ─────────────────────────────────────────────────────────────

export async function signAccessToken(payload: {
  userId: string;
  email: string;
  name: string;
}): Promise<string> {
  const privateKeyPem = process.env.AUTH_PRIVATE_KEY!;
  const privateKey = await importPKCS8(privateKeyPem, ALG);

  return new SignJWT({
    email: payload.email,
    name: payload.name,
  })
    .setProtectedHeader({ alg: ALG, kid: "convexpress-admin-1" })
    .setSubject(payload.userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(ACCESS_TOKEN_EXPIRY)
    .sign(privateKey);
}

// ─── JWKS (Public Key Set) ────────────────────────────────────────────────────

export async function getJWKS(): Promise<{ keys: object[] }> {
  const privateKeyPem = process.env.AUTH_PRIVATE_KEY!;
  // Must pass { extractable: true } so exportJWK can read the key material.
  // jose v6+ defaults to non-extractable keys.
  const privateKey = await importPKCS8(privateKeyPem, ALG, { extractable: true });
  const publicJwk = await exportJWK(privateKey);
  const { d, ...publicOnly } = publicJwk as Record<string, unknown>;

  return {
    keys: [
      {
        ...publicOnly,
        alg: ALG,
        use: "sig",
        kid: "convexpress-admin-1",
      },
    ],
  };
}

// ─── Password Hashing ─────────────────────────────────────────────────────────

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// ─── Refresh Token Generation ─────────────────────────────────────────────────

export function generateRefreshToken(): string {
  const bytes = new Uint8Array(REFRESH_TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function hashRefreshToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function hashSetupToken(token: string): Promise<string> {
  return await hashRefreshToken(token);
}
