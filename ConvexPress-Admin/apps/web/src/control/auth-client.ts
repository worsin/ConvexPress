import {
  convexClient,
  crossDomainClient,
} from "@convex-dev/better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

import {
  controlAuthStorage,
  flushControlAuthStorage,
} from "./auth-storage";

export function createControlAuthClient(siteOrigin: string) {
  return createAuthClient({
    baseURL: siteOrigin,
    fetchOptions: { timeout: 15_000 },
    plugins: [
      convexClient(),
      crossDomainClient({ storage: controlAuthStorage }),
    ],
  });
}

export type ControlAuthClient = ReturnType<typeof createControlAuthClient>;

const CONTROL_CLAIM_SECRET_HEADER = "x-convexpress-claim-secret";

export function generateControlClaimSecret() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

export function prepareControlIdentity(emailValue: string, nameValue: string) {
  const email = emailValue.trim().toLowerCase();
  const name = nameValue.trim() || email.split("@", 1)[0] || "ConvexPress operator";
  return { email, name };
}

export async function signInControlOperator(
  client: ControlAuthClient,
  email: string,
  password: string,
) {
  const { error } = await client.signIn.email({
    email: email.trim().toLowerCase(),
    password,
  });
  if (error) throw new Error(error.message || "Sign-in failed");
  await flushControlAuthStorage();
}

export async function claimControlInvitation(
  client: ControlAuthClient,
  emailValue: string,
  password: string,
  nameValue: string,
  claimSecretValue: string,
) {
  const { email, name } = prepareControlIdentity(emailValue, nameValue);
  const claimSecret = claimSecretValue.trim();
  const { error } = await client.signUp.email(
    { email, password, name },
    { headers: { [CONTROL_CLAIM_SECRET_HEADER]: claimSecret } },
  );
  if (error) throw new Error(error.message || "Invitation claim failed");
  await signInControlOperator(client, email, password);
  await flushControlAuthStorage();
}

export async function signOutControlOperator(client: ControlAuthClient) {
  await client.signOut();
  await flushControlAuthStorage();
}
