import { useMemo } from "react";

import type { DisplayNameOption, UserProfile } from "@/lib/dashboard/types";

/**
 * Generates display name options from the user's name parts.
 * Mirrors the WordPress "Display name publicly as" dropdown.
 *
 * Options include:
 * 1. Email username (portion before @)
 * 2. First name (if available)
 * 3. Last name (if available)
 * 4. "First Last" (if both available)
 * 5. "Last, First" (if both available)
 * 6. Nickname (if available and different from above)
 *
 * Duplicates are removed via Set.
 */
export function useDisplayNameOptions(user: UserProfile): DisplayNameOption[] {
  return useMemo(() => {
    const options = new Set<string>();

    // Email username is always available
    const emailUsername = user.email.split("@")[0];
    if (emailUsername) {
      options.add(emailUsername);
    }

    // First name
    if (user.firstName) {
      options.add(user.firstName);
    }

    // Last name
    if (user.lastName) {
      options.add(user.lastName);
    }

    // "First Last"
    if (user.firstName && user.lastName) {
      options.add(`${user.firstName} ${user.lastName}`);
    }

    // "Last, First"
    if (user.firstName && user.lastName) {
      options.add(`${user.lastName}, ${user.firstName}`);
    }

    // Nickname (if different from above)
    if (user.nickname) {
      options.add(user.nickname);
    }

    return Array.from(options).map((name) => ({
      label: name,
      value: name,
    }));
  }, [user.email, user.firstName, user.lastName, user.nickname]);
}
