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

export function useAuth() {
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
