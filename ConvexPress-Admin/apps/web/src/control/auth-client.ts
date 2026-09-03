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

export async function signOutControlOperator(client: ControlAuthClient) {
  await client.signOut();
  await flushControlAuthStorage();
}
