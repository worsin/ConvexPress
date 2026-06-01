export type ClerkPasswordHasher = "phpass" | "bcrypt";

export type ClerkProvisioningStatus =
  | "pending"
  | "provisioned"
  | "linked_existing"
  | "reset_required"
  | "skipped"
  | "failed";

export type ClerkProvisioningResult = {
  status: ClerkProvisioningStatus;
  reason?: string;
  clerkUserId?: string;
  passwordHasher?: ClerkPasswordHasher;
  error?: string;
};

function asArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
    : [];
}

export function normalizeClerkEmail(email: string | undefined): string | undefined {
  const normalized = email?.trim().toLowerCase();
  return normalized || undefined;
}

export function detectClerkPasswordHasher(
  passwordDigest: string | undefined,
): { supported: true; hasher: ClerkPasswordHasher } | { supported: false; reason: string } {
  if (!passwordDigest?.trim()) {
    return { supported: false, reason: "missing_digest" };
  }

  const digest = passwordDigest.trim();

  if (digest.startsWith("$wp$2y$")) {
    return { supported: false, reason: "wordpress_6_8_sha384_bcrypt" };
  }

  if (digest.startsWith("$P$")) {
    return { supported: true, hasher: "phpass" };
  }

  if (/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(digest)) {
    return { supported: true, hasher: "bcrypt" };
  }

  return { supported: false, reason: "unsupported_digest_format" };
}

export function extractClerkUserId(payload: unknown): string | undefined {
  const record = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  return typeof record.id === "string" ? record.id : undefined;
}

export function clerkErrorMessage(payload: string): string {
  try {
    const parsed = JSON.parse(payload) as {
      errors?: Array<{ message?: string; long_message?: string; code?: string }>;
    };
    const first = parsed.errors?.[0];
    return first?.long_message || first?.message || first?.code || payload.slice(0, 300);
  } catch {
    return payload.slice(0, 300);
  }
}

export async function findClerkUserByEmail(
  clerkSecretKey: string,
  email: string,
): Promise<string | undefined> {
  const url = new URL("https://api.clerk.com/v1/users");
  url.searchParams.set("email_address", email);
  url.searchParams.set("limit", "1");

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${clerkSecretKey}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(clerkErrorMessage(await response.text()));
  }

  const data = await response.json();
  const rows = Array.isArray(data) ? data : asArray((data as Record<string, unknown>)?.data);
  const first = rows[0];
  return typeof first?.id === "string" ? first.id : undefined;
}

export function buildClerkCreateUserPayload(args: {
  email: string;
  source: string;
  userId: string;
  externalId?: string;
  firstName?: string;
  lastName?: string;
  username?: string;
  displayName?: string;
  password?: string;
  passwordDigest?: string;
  passwordHasher?: ClerkPasswordHasher;
  skipPasswordRequirement?: boolean;
}): Record<string, unknown> {
  const body: Record<string, unknown> = {
    external_id: args.externalId || `convexpress:${args.source}:${args.userId}`,
    email_address: [args.email],
    first_name: args.firstName || undefined,
    last_name: args.lastName || undefined,
    skip_legal_checks: true,
    private_metadata: {
      convexpress: {
        source: args.source,
        userId: args.userId,
        username: args.username,
      },
    },
    public_metadata: args.displayName ? { displayName: args.displayName } : undefined,
  };

  if (args.passwordDigest && args.passwordHasher) {
    body.password_digest = args.passwordDigest;
    body.password_hasher = args.passwordHasher;
  } else if (args.password) {
    body.password = args.password;
  } else if (args.skipPasswordRequirement !== false) {
    body.skip_password_requirement = true;
  }

  return body;
}
