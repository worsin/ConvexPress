/** Auth user object shape (provider-agnostic) */
export interface AuthUser {
  id: string;
  email: string;
  emailVerified: boolean;
  firstName: string | null;
  lastName: string | null;
  profilePictureUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Auth state shape */
export interface AuthState {
  isLoading: boolean;
  user: AuthUser | null;
  signIn: () => void;
  signOut: () => void;
}

/** Registration mode returned by canRegister query */
export interface RegistrationMode {
  open: boolean;
  inviteOnly: boolean;
  defaultRole: string;
}

/** Invitation data from getInvitationByToken query */
export interface InvitationData {
  email: string;
  role: string;
  message?: string;
  expiresAt: number;
  status: "pending" | "accepted" | "expired" | "revoked";
  inviterName?: string;
}

/** Return URL parameters for admin redirect */
export interface AuthRedirectParams {
  returnTo?: string;
}

/** Forgot password form state */
export interface ForgotPasswordState {
  submitted: boolean;
  email: string;
}

/** Password strength result */
export interface PasswordStrengthResult {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  suggestions: string[];
  meetsRequirements: boolean;
}

/** Subset of settings relevant to registration gate */
export interface RegistrationSettings {
  anyoneCanRegister: boolean;
  registrationMode: "invite_only" | "closed";
  defaultRole: string;
  invitationExpiryDays: number;
  requireEmailVerification: boolean;
}
