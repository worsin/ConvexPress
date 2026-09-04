import type { ReactNode } from "react";

type SignOutOptions = {
  redirectUrl?: string;
};

type SetActiveOptions = {
  session?: string | null;
};

type OAuthRedirectOptions = {
  strategy: string;
  redirectUrl?: string;
  redirectUrlComplete?: string;
};

type SignInCreateOptions = {
  identifier: string;
  password: string;
};

type SignUpCreateOptions = {
  emailAddress: string;
  password: string;
  firstName?: string;
  lastName?: string;
};

type VerifyEmailOptions = {
  strategy: string;
};

type AttemptEmailVerificationOptions = {
  code: string;
};

type SignInCreateResult =
  | {
      status: "complete";
      createdSessionId: string;
    }
  | {
      status: "needs_identifier" | "needs_first_factor" | "needs_second_factor" | "abandoned";
      createdSessionId?: never;
    };

type SignUpCreateResult =
  | {
      status: "complete";
      createdSessionId: string;
    }
  | {
      status: "missing_requirements" | "missing_fields" | "needs_verification" | "abandoned";
      createdSessionId?: never;
    };

type SignUpVerificationResult =
  | {
      status: "complete";
      createdSessionId: string;
    }
  | {
      status: "missing_requirements" | "needs_verification" | "abandoned";
      createdSessionId?: never;
    };

type ClerkUser = {
  firstName?: string | null;
  lastName?: string | null;
  imageUrl?: string | null;
  primaryEmailAddress?: { emailAddress?: string | null } | null;
};

const AUTH_UNAVAILABLE_MESSAGE =
  "Authentication is not configured for this website yet.";

function authUnavailableError() {
  return new Error(AUTH_UNAVAILABLE_MESSAGE);
}

async function rejectAuthRequest<T>(): Promise<T> {
  throw authUnavailableError();
}

export function ClerkProvider({
  children,
}: {
  children: ReactNode;
  publishableKey?: string;
}) {
  return <>{children}</>;
}

/**
 * Local dev session bridge.
 *
 * Fleet/test sites run without Clerk keys, which makes every member surface
 * unreachable in a browser. In dev builds only, a site-issued access token
 * stored under `convexpress:dev-session` (JSON: { token, userId? }) is
 * presented to Convex as the member's auth token so the dashboard, tickets,
 * and notifications can be driven end to end. Production builds strip this
 * entirely (`import.meta.env.DEV` is a compile-time constant).
 */
const DEV_SESSION_KEY = "convexpress:dev-session";

type DevSession = { token: string; userId?: string };

function readDevSession(): DevSession | null {
  if (!import.meta.env.DEV || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(DEV_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DevSession>;
    if (typeof parsed.token !== "string" || parsed.token.length === 0) return null;
    return { token: parsed.token, userId: typeof parsed.userId === "string" ? parsed.userId : undefined };
  } catch {
    return null;
  }
}

export function useAuth() {
  const dev = readDevSession();
  if (dev) {
    return {
      isLoaded: true,
      isSignedIn: true,
      userId: (dev.userId ?? "dev-session") as string | null,
      sessionId: "dev-session" as string | null,
      getToken: async () => dev.token as string | null,
    };
  }
  return {
    isLoaded: true,
    isSignedIn: false,
    userId: null as string | null,
    sessionId: null as string | null,
    getToken: async () => null as string | null,
  };
}

export function useUser() {
  return {
    isLoaded: true,
    isSignedIn: false,
    user: null as ClerkUser | null,
  };
}

export function useClerk() {
  return {
    signOut: async (options?: SignOutOptions) => {
      if (options?.redirectUrl) {
        window.location.assign(options.redirectUrl);
      }
    },
    openSignIn: rejectAuthRequest,
    openUserProfile: rejectAuthRequest,
  };
}

export function useSignIn() {
  return {
    isLoaded: true,
    signIn: {
      create: async (_options: SignInCreateOptions): Promise<SignInCreateResult> =>
        rejectAuthRequest(),
      authenticateWithRedirect: async (_options: OAuthRedirectOptions) =>
        rejectAuthRequest(),
    },
    setActive: async (_options: SetActiveOptions) => {
      throw authUnavailableError();
    },
  };
}

export function useSignUp() {
  return {
    isLoaded: true,
    signUp: {
      create: async (_options: SignUpCreateOptions): Promise<SignUpCreateResult> =>
        rejectAuthRequest(),
      authenticateWithRedirect: async (_options: OAuthRedirectOptions) =>
        rejectAuthRequest(),
      prepareEmailAddressVerification: async (_options: VerifyEmailOptions) =>
        rejectAuthRequest(),
      attemptEmailAddressVerification: async (
        _options: AttemptEmailVerificationOptions,
      ): Promise<SignUpVerificationResult> =>
        rejectAuthRequest(),
    },
    setActive: async (_options: SetActiveOptions) => {
      throw authUnavailableError();
    },
  };
}
