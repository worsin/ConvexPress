/** Local input (including an intentional empty value) wins over hydrated defaults. */
export function checkoutContactEmail(
  editedEmail: string | undefined,
  sessionEmail: string | null | undefined,
  userEmail: string | null | undefined,
): string {
  return editedEmail ?? (sessionEmail?.trim() ? sessionEmail : userEmail ?? "");
}
