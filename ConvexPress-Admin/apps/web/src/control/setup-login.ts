import { isPendingLoginCredentialHandoff } from "../lib/first-admin-setup";

/** Consume the native wizard handoff once, before starting any auth request. */
export async function completeControlSetupLogin(input: {
  credentials: unknown;
  clear: () => Promise<unknown>;
  signIn: (email: string, password: string) => Promise<unknown>;
}): Promise<string | undefined> {
  if (input.credentials == null) return;
  // Do not leave plaintext setup credentials on disk through a failed request,
  // application crash or relaunch. A failed clear must prevent the request.
  await input.clear();
  if (!isPendingLoginCredentialHandoff(input.credentials)) {
    return "Your setup sign-in expired. Please sign in again.";
  }
  try {
    await input.signIn(input.credentials.identifier, input.credentials.password);
  } catch {
    return "Setup saved your connection, but sign-in did not complete. Please sign in again.";
  }
}
