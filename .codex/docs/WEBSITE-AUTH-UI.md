# Website Auth Pages UI - Expert Knowledge Document

**System:** Website Auth Pages UI
**Expert Type:** Website UI Expert
**Status:** Implementation Ready
**Priority:** P0 - Critical
**WordPress Equivalent:** `wp-login.php` (login form, registration form, lost password form, reset password form), custom login page plugins, theme login customization
**Last Analyzed:** 2026-02-09

---

## IMPORTANT: Convex Auth

**The Airtable blueprint and Registration/Password Management system docs were originally designed assuming a different auth provider. The actual implementation uses Convex Auth.** This expert document reflects the real implementation.

Key differences from the original blueprint:

- **Auth Provider:** Convex Auth
- **Client Package:** `@auth/authkit-tanstack-react-start` for website, `@auth-inc/authkit-react` for admin
- **No Pre-Built Components:** Convex Auth supports fully headless custom-branded auth -- there are no pre-built `<SignIn />` or `<SignUp />` components. All auth UI is custom-built.
- **No Satellite Cookie Complexity:** Convex Auth uses redirect URIs per app instead of primary/satellite domain cookies. Both apps share the same Convex Auth Client ID with different redirect URIs.
- **OAuth Flow:** Convex Auth `signIn()` redirects to the Convex Auth-hosted auth page, which then redirects back to the callback URL. Custom headless flows are possible but not yet implemented.
- **SSR Auth:** TanStack Start uses `getAuth()` from `@auth/authkit-tanstack-react-start` for server-side auth checks.

All references to the previous auth provider in the Registration System and Password Management System expert docs should be mentally replaced with "Convex Auth" when they relate to auth provider interactions.

---

## Quick Reference

### What This Expert Does

The Website Auth Pages UI Expert owns all authentication-related pages and components rendered on the public website app (`ConvexPress-Website/`). This includes the login page, registration page, forgot password flow, reset password flow, email verification, logout action, and the admin redirect pattern. It is responsible for:

1. **Page layouts** -- Centered auth card layouts with branding, consistent across all auth flows
2. **Form components** -- Custom-branded login/register forms using Base UI primitives
3. **Auth flow orchestration** -- Coordinating between Convex Auth APIs and the UI
4. **Registration gate** -- Checking whether self-registration is open, closed, or invitation-only
5. **Admin redirect handling** -- Processing `?returnTo=` params for the admin cross-app redirect pattern
6. **Loading and error states** -- Skeleton loaders, error messages, redirect indicators
7. **Accessibility** -- Form labels, error announcements, focus management

This expert does NOT:
- Define Convex queries or mutations (those belong to Auth System, Registration System, Password Management System experts)
- Handle webhook processing or server-side token validation
- Manage Convex Auth configuration or API keys

### Key Concepts

| Concept | Description |
|---------|-------------|
| **AuthPageLayout** | Shared layout wrapper for all auth pages -- centered card, site logo, background treatment |
| **Registration Gate** | UI-side check via Convex query to determine if self-registration is open, closed, or invitation-only |
| **Admin Redirect Flow** | When admin app's `signIn()` fires, Convex Auth redirects to the website's callback. After auth, the user is redirected back to admin via the Convex Auth-configured redirect URI. |
| **Convex Auth signIn()** | Client-side function from `useAuth()` that redirects to the auth system-hosted auth. Currently used as-is; future: custom headless forms. |
| **Convex Auth getAuth()** | Server-side (SSR) function for TanStack Start loaders. Checks if user is authenticated before page render. |
| **Invitation Token** | URL parameter `?token=...` on the register page that pre-validates an admin invitation |
| **noindex Meta** | All auth pages add `<meta name="robots" content="noindex">` since they should not be search-indexed |

### ConvexPress vs WordPress

| Aspect | WordPress | ConvexPress |
|--------|-----------|-------------|
| Login URL | `/wp-login.php` | `/login` |
| Register URL | `/wp-login.php?action=register` | `/register` |
| Lost Password URL | `/wp-login.php?action=lostpassword` | `/forgot-password` |
| Reset Password URL | `/wp-login.php?action=rp&key=...&login=...` | `/reset-password` (Convex Auth handles token internally) |
| Login form | PHP-rendered form with wp_login_form() | Custom React form using Base UI + Convex Auth `signIn()` |
| Register form | Basic username/email/password | Convex Auth-powered signup with OAuth, custom fields possible |
| OAuth buttons | Via plugins (WP Social Login, etc.) | Native via Convex Auth (Google, GitHub, etc.) |
| Login page theme | WordPress default or theme customization | Fully custom via AuthPageLayout component |
| Remember me | Cookie-based via `wp_set_auth_cookie()` | auth session management (automatic) |
| Branding | WordPress logo (customizable via `login_headerurl` filter) | Site logo from Theme/Settings system |
| Two-factor auth | Via plugins (WordFence, etc.) | Native via Convex Auth (TOTP, SMS) |
| Admin redirect | Direct cookie-based access | Convex Auth redirect URI pattern with `returnTo` parameter |
| SSR | PHP-rendered (always SSR) | TanStack Start SSR with `getAuth()` loader checks |

---

## Architecture Overview

### Auth Page Flow

```
User visits /login
    |
    v
TanStack Start SSR loader calls getAuth()
    |
    +--> User IS authenticated -> redirect to "/" (or returnTo URL)
    +--> User is NOT authenticated -> render login page
              |
              v
         Login page renders:
         - AuthPageLayout (centered card with branding)
         - Login form (email, password, OAuth buttons)
         - "Forgot password?" link
         - "Don't have an account? Register" link
              |
              v
         User clicks "Sign In" or OAuth button
              |
              v
         Convex Auth signIn() redirects to the auth system auth
              |
              v
         Convex Auth authenticates user
              |
              v
         Redirect to /api/auth/callback
              |
              v
         handleCallbackRoute() processes token exchange
              |
              v
         Redirect to "/" (or returnTo URL)
```

### Admin Cross-App Redirect Flow

```
Admin app: user is not authenticated
    |
    v
_authenticated.tsx calls signIn()
    |
    v
Convex Auth redirects to the auth system-hosted auth
(with admin app's redirect URI configured in Convex Auth)
    |
    v
User authenticates
    |
    v
Convex Auth redirects to admin /callback
    |
    v
Admin AuthKitProvider processes tokens
    |
    v
User is authenticated in admin app
```

Note: Convex Auth handles multi-app auth via separate redirect URIs configured in the Convex Auth dashboard. Both apps share the same Client ID. The website does NOT need to handle admin login redirects -- each app has its own callback URL configured in Convex Auth.

### Registration Gate Flow

```
User visits /register
    |
    v
SSR loader calls getAuth()
    |
    +--> Already authenticated -> redirect to "/"
    |
    +--> Not authenticated -> check registration mode
              |
              v
         Client-side: useQuery(api.registration.canRegister)
              |
              +--> { open: true } -> Show registration form
              |
              +--> { open: false, inviteOnly: false } -> Show "Registration Closed" page
              |
              +--> { open: false, inviteOnly: true } -> Show "Invitation Only" message
                        |
                        +--> URL has ?token=... -> Validate token, show registration form
                        +--> No token -> Show invitation-required message
```

### Password Reset Flow

```
User visits /forgot-password
    |
    v
SSR loader: if authenticated, redirect to /dashboard/settings
    |
    v
Render forgot password form (email input)
    |
    v
User submits email
    |
    v
Client calls server action -> Convex Auth password reset API
    + Records reset request in Convex (recordResetRequest internal mutation)
    |
    v
Convex Auth sends reset email with magic link
    |
    v
User clicks link -> Convex Auth handles reset flow
    |
    v
User sets new password on Convex Auth-hosted page
    |
    v
Convex Auth fires user.updated webhook -> Convex detects password change
```

### Provider Stack (Website App)

```
<ConvexProvider client={convexClient}>
  <AuthKitProvider>       {/* @auth/authkit-tanstack-react-start/client */}
    <html>
      <body>
        <Header />        {/* uses useAuth() for sign-in/sign-out state */}
        <Outlet />        {/* Route components */}
      </body>
    </html>
  </AuthKitProvider>
</ConvexProvider>
```

### Real-Time Behavior

- **Registration gate:** The `canRegister` query is a Convex reactive subscription. If an admin toggles registration on/off in settings, the `/register` page updates in real-time without page reload -- switching between the registration form and "Registration Closed" message.
- **Invitation validation:** The `getInvitationByToken` query updates reactively. If an admin revokes an invitation while the user is on the registration page, the form is replaced with an "Invitation expired or revoked" message.
- **Auth state:** `useAuth()` from the auth system provides reactive `isLoading`, `user`, `signIn()`, `signOut()` state across all pages via the AuthKitProvider.

### SSR Considerations

All auth pages use TanStack Start's SSR capabilities:

- **Loader auth checks:** Each auth page's `loader` calls `getAuth()` to check auth state server-side. Authenticated users are redirected before the page renders (faster than client-side redirect).
- **No SEO indexing:** Auth pages add `noindex` meta tags. They don't need to be crawled.
- **Progressive enhancement:** Forms should work without JavaScript where possible (standard `<form>` elements with `action`), then enhance with client-side behavior.
- **Server actions:** Sensitive operations (like recording a forgot-password request) should use TanStack Start server functions, not direct client-side Convex mutations, to keep logic server-side.

---

## TypeScript Types

### Auth State Types

```typescript
// ConvexPress-Website/apps/web/src/lib/auth/types.ts

/** Convex Auth user object from useAuth() */
export interface AuthUser {
  id: string;                      // user identifier
  email: string;
  emailVerified: boolean;
  firstName: string | null;
  lastName: string | null;
  profilePictureUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Auth state from useAuth() hook */
export interface AuthState {
  isLoading: boolean;
  user: AuthUser | null;
  signIn: () => void;
  signOut: () => void;
}

/** Registration mode returned by canRegister query */
export interface RegistrationMode {
  open: boolean;                   // Whether self-registration is enabled
  inviteOnly: boolean;            // Whether registration requires an invitation
  defaultRole: string;            // Role assigned to self-registered users
}

/** Invitation data from getInvitationByToken query */
export interface InvitationData {
  email: string;                   // Pre-filled email from invitation
  role: string;                    // Role that will be assigned
  message?: string;                // Optional personal message from admin
  expiresAt: number;              // Expiration timestamp
  status: "pending" | "accepted" | "expired" | "revoked";
  inviterName?: string;           // Name of the admin who sent the invitation
}

/** Return URL parameters for admin redirect */
export interface AuthRedirectParams {
  returnTo?: string;               // URL to redirect to after authentication
}

/** Forgot password form state */
export interface ForgotPasswordState {
  submitted: boolean;              // Whether the form was submitted
  email: string;                   // Email address submitted
}

/** Password strength result */
export interface PasswordStrengthResult {
  score: 0 | 1 | 2 | 3 | 4;     // 0=very weak, 4=very strong
  label: string;                   // "Very Weak", "Weak", "Fair", "Strong", "Very Strong"
  suggestions: string[];           // Improvement suggestions
  meetsRequirements: boolean;      // Whether it meets minimum requirements
}
```

### Registration Settings Types

```typescript
// Subset of settings relevant to registration gate

export interface RegistrationSettings {
  anyoneCanRegister: boolean;       // maps to settings.general.anyoneCanRegister
  defaultRole: string;              // maps to settings.general.defaultRole
  invitationExpiryDays: number;     // maps to settings.registration.invitationExpiryDays
  requireEmailVerification: boolean; // maps to settings.registration.requireEmailVerification
}
```

---

## Component Inventory

### Layout Components

#### `AuthPageLayout`

**File:** `ConvexPress-Website/apps/web/src/components/auth/AuthPageLayout.tsx`
**Purpose:** Shared layout wrapper for all authentication pages. Provides consistent visual treatment: centered content card, site branding, background, and footer links.

**Props:**
```typescript
interface AuthPageLayoutProps {
  children: React.ReactNode;
  title: string;                    // Page heading (e.g., "Sign In", "Create Account")
  description?: string;             // Subheading text below title
  showLogo?: boolean;               // Whether to show site logo above the card (default: true)
  maxWidth?: "sm" | "md" | "lg";   // Card max width (default: "sm")
}
```

**Responsibilities:**
- Render a vertically + horizontally centered layout with a Card containing the auth form
- Display site logo (from Settings system via Convex query) above the card
- Apply a subtle background treatment (gradient or pattern using CSS variables, no hardcoded colors)
- Include footer with "Back to home" link
- Add `<meta name="robots" content="noindex">` via TanStack Start's `head` configuration

**UI Structure:**
```
+----------------------------------------------------------+
|                    [background treatment]                  |
|                                                            |
|                     [Site Logo]                            |
|                                                            |
|              +----------------------------+                |
|              |  Title                      |               |
|              |  Description                |               |
|              |                             |               |
|              |  {children}                 |               |
|              |                             |               |
|              +----------------------------+                |
|                                                            |
|                     Back to home                           |
+----------------------------------------------------------+
```

**Base UI Dependencies:** None directly (uses Card from `@/components/ui/card`)
**Styling:**
- Background: `bg-background` with subtle overlay (e.g., `bg-muted/20` or a CSS custom property pattern)
- Card: Uses existing `<Card>` component with `ring-foreground/10` border
- Logo: Fetched from settings or rendered as site name text fallback
- All colors via CSS variables -- NEVER hardcoded

---

#### `AuthDivider`

**File:** `ConvexPress-Website/apps/web/src/components/auth/AuthDivider.tsx`
**Purpose:** "or" divider line between OAuth buttons and email/password form.

**Props:**
```typescript
interface AuthDividerProps {
  text?: string;  // Default: "or"
}
```

**UI:** Horizontal line with centered text, e.g. `───── or ─────`
**Styling:** `border-border` lines, `text-muted-foreground` text

---

### Auth Form Components

#### `LoginForm`

**File:** `ConvexPress-Website/apps/web/src/components/auth/LoginForm.tsx`
**Purpose:** Email/password login form with OAuth buttons. Currently wraps Convex Auth `signIn()` for redirect-based auth; will evolve to custom headless form when Convex Auth custom UI is implemented.

**Props:**
```typescript
interface LoginFormProps {
  returnTo?: string;               // URL to redirect after login
  signInUrl?: string;              // Pre-generated sign-in URL from SSR loader
}
```

**Responsibilities:**
- Display "Sign In" heading (via AuthPageLayout)
- Render OAuth buttons section (Google, GitHub -- configurable)
- Render AuthDivider
- Render email + password inputs (for future custom flow)
- "Forgot password?" link -> `/forgot-password`
- "Remember me" checkbox (for future custom flow)
- Submit button
- "Don't have an account? Register" link -> `/register`
- Error display for failed login attempts

**Current Implementation (Phase 1 -- redirect-based):**
The login page currently uses Convex Auth's redirect flow via `signIn()` or a pre-generated `signInUrl`. The email/password form fields are not yet functional -- the primary CTA is a "Sign In with the auth system" button that redirects to the Convex Auth-hosted auth page.

**Future Implementation (Phase 2 -- headless):**
When Convex Auth custom headless auth is implemented, this component will handle email/password submission directly via Convex Auth's headless API, with inline error handling and no redirects to the auth system-hosted pages.

**Form Validation (Zod):**
```typescript
const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required"),
  rememberMe: z.boolean().optional(),
});
```

**Base UI Dependencies:** `@base-ui/react/button` (via Button component), `@base-ui/react/input` (via Input component), `@base-ui/react/checkbox` (via Checkbox component)

---

#### `RegisterForm`

**File:** `ConvexPress-Website/apps/web/src/components/auth/RegisterForm.tsx`
**Purpose:** User registration form. Shown only when the registration gate allows it.

**Props:**
```typescript
interface RegisterFormProps {
  invitation?: InvitationData;      // Pre-filled data from invitation (if invite-based)
  defaultRole?: string;             // Role that will be assigned
}
```

**Responsibilities:**
- Display OAuth signup buttons
- AuthDivider
- Email input (pre-filled and disabled if invitation-based)
- First name + last name inputs
- Password + confirm password inputs
- Password strength indicator
- Terms of Service + Privacy Policy checkbox
- Submit button ("Create Account")
- "Already have an account? Sign in" link -> `/login`
- If invitation: show invitation message from admin, pre-filled email

**Current Implementation (Phase 1):**
Similar to login, currently redirects to the auth system for signup. The form fields serve as the future headless implementation target.

**Form Validation (Zod):**
```typescript
const registerSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  firstName: z.string().min(1, "First name is required").max(50),
  lastName: z.string().min(1, "Last name is required").max(50),
  password: z.string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain an uppercase letter")
    .regex(/[a-z]/, "Password must contain a lowercase letter")
    .regex(/[0-9]/, "Password must contain a number"),
  confirmPassword: z.string(),
  acceptTerms: z.boolean().refine(val => val === true, "You must accept the terms"),
}).refine(data => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});
```

**Base UI Dependencies:** Button, Input, Checkbox

---

#### `OAuthButtons`

**File:** `ConvexPress-Website/apps/web/src/components/auth/OAuthButtons.tsx`
**Purpose:** Renders OAuth provider buttons (Google, GitHub, etc.) for login and registration.

**Props:**
```typescript
interface OAuthButtonsProps {
  mode: "signin" | "signup";        // Determines button label text
  providers?: OAuthProvider[];      // Which providers to show (default: all enabled)
  disabled?: boolean;               // Disable during form submission
}

type OAuthProvider = "google" | "github" | "microsoft" | "apple";
```

**Responsibilities:**
- Render a button for each enabled OAuth provider
- Each button shows the provider's icon (from Lucide or custom SVG) + text ("Continue with Google")
- On click, call Convex Auth `signIn()` with the appropriate provider hint
- Disabled state during loading

**Styling:**
- Outline variant buttons with provider-specific icons
- Stack vertically with consistent spacing
- No hardcoded provider brand colors -- use `border-border` and `hover:bg-muted`

---

#### `PasswordStrengthIndicator`

**File:** `ConvexPress-Website/apps/web/src/components/auth/PasswordStrengthIndicator.tsx`
**Purpose:** Visual password strength meter shown during registration and password reset.

**Props:**
```typescript
interface PasswordStrengthIndicatorProps {
  password: string;                 // Current password value
  showSuggestions?: boolean;        // Show improvement tips (default: true)
}
```

**Responsibilities:**
- Calculate password strength using a scoring algorithm (length, character variety, common patterns)
- Display a segmented strength bar (4 segments) with color coding via CSS variables
- Show strength label ("Very Weak", "Weak", "Fair", "Strong", "Very Strong")
- Optionally show improvement suggestions

**Strength Colors (CSS variable-based):**
- Score 0-1: `text-destructive` / `bg-destructive/20`
- Score 2: `text-warning` / `bg-warning/20` (define `--warning` CSS variable if not exists, or use `bg-primary/30` as fallback)
- Score 3-4: `text-primary` / `bg-primary/20`

**Note:** If a `--warning` CSS variable is not defined, use opacity-based approach: `bg-primary/30` for medium, `bg-destructive/30` for weak. Never use hardcoded color names like `bg-amber-500`.

---

#### `RegistrationGate`

**File:** `ConvexPress-Website/apps/web/src/components/auth/RegistrationGate.tsx`
**Purpose:** Wrapper component that checks registration mode and conditionally renders the registration form, closed message, or invitation validation.

**Props:**
```typescript
interface RegistrationGateProps {
  token?: string;                   // Invitation token from URL
  children: React.ReactNode;        // The registration form to render if allowed
}
```

**Responsibilities:**
- Subscribe to `canRegister` Convex query
- If loading: show skeleton/loading state
- If registration is open: render children (the RegisterForm)
- If registration is closed and no token: render RegistrationClosedMessage
- If invitation-only:
  - With valid token: validate via `getInvitationByToken` query, render children with invitation data
  - With invalid/expired/revoked token: render InvitationInvalidMessage
  - Without token: render InvitationRequiredMessage

---

#### `RegistrationClosedMessage`

**File:** `ConvexPress-Website/apps/web/src/components/auth/RegistrationClosedMessage.tsx`
**Purpose:** Friendly message shown when self-registration is disabled.

**Props:** None

**UI:**
```
Registration is currently closed.

If you have an invitation, use the link provided in your
invitation email to register.

Already have an account? Sign in
```

---

#### `InvitationRequiredMessage`

**File:** `ConvexPress-Website/apps/web/src/components/auth/InvitationRequiredMessage.tsx`
**Purpose:** Message shown when registration is invitation-only and no token is provided.

**Props:** None

**UI:**
```
Invitation Required

Registration is by invitation only. If you've received an
invitation email, click the link in that email to register.

Already have an account? Sign in
```

---

#### `InvitationInvalidMessage`

**File:** `ConvexPress-Website/apps/web/src/components/auth/InvitationInvalidMessage.tsx`
**Purpose:** Message shown when an invitation token is invalid, expired, or revoked.

**Props:**
```typescript
interface InvitationInvalidMessageProps {
  reason: "expired" | "revoked" | "not_found" | "already_used";
}
```

**UI:**
```
Invitation Invalid

This invitation has {expired / been revoked / already been used / is not valid}.

Contact the site administrator for a new invitation.

Already have an account? Sign in
```

---

#### `ForgotPasswordForm`

**File:** `ConvexPress-Website/apps/web/src/components/auth/ForgotPasswordForm.tsx`
**Purpose:** Email input form for initiating password reset.

**Props:** None

**Responsibilities:**
- Email input field
- Submit button ("Send Reset Link")
- On submit: Call server action that triggers Convex Auth password reset + records in Convex
- After submit: Show success message (always, to prevent email enumeration)
- "Back to Sign In" link -> `/login`

**Success State UI:**
```
Check your email

If an account exists with that email address, we've sent
a password reset link. Check your inbox and spam folder.

Back to Sign In
```

**Form Validation (Zod):**
```typescript
const forgotPasswordSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
});
```

---

#### `ForgotPasswordSuccess`

**File:** `ConvexPress-Website/apps/web/src/components/auth/ForgotPasswordSuccess.tsx`
**Purpose:** Success message shown after forgot-password form submission.

**Props:**
```typescript
interface ForgotPasswordSuccessProps {
  email: string;                    // Email that was submitted (partially masked)
}
```

**Responsibilities:**
- Display success icon (Lucide `MailCheck` or `CheckCircle`)
- Show "Check your email" heading
- Show partially masked email (e.g., "t***@example.com")
- "Didn't receive it? Check spam" helper text
- "Back to Sign In" link

---

### Utility Components

#### `AuthLink`

**File:** `ConvexPress-Website/apps/web/src/components/auth/AuthLink.tsx`
**Purpose:** Styled link used in auth pages for navigation between auth flows.

**Props:**
```typescript
interface AuthLinkProps {
  to: string;
  children: React.ReactNode;
  className?: string;
}
```

**Styling:** `text-primary hover:underline text-xs font-medium`

---

#### `AuthError`

**File:** `ConvexPress-Website/apps/web/src/components/auth/AuthError.tsx`
**Purpose:** Inline error message component for auth forms.

**Props:**
```typescript
interface AuthErrorProps {
  message: string;
  className?: string;
}
```

**Styling:** `text-destructive text-xs` with `bg-destructive/10 border border-destructive/20 rounded-none p-3`

---

## Hooks

### `useRegistrationGate`

**File:** `ConvexPress-Website/apps/web/src/hooks/useRegistrationGate.ts`

```typescript
interface UseRegistrationGateResult {
  isLoading: boolean;
  canRegister: boolean;
  isInviteOnly: boolean;
  registrationMode: RegistrationMode | undefined;
}

function useRegistrationGate(): UseRegistrationGateResult
```

**Behavior:**
- Calls `useQuery(api.registration.canRegister)` from Convex
- Returns loading state, computed booleans, and raw registration mode data
- Reactive: updates in real-time if admin changes registration settings

---

### `useInvitationValidation`

**File:** `ConvexPress-Website/apps/web/src/hooks/useInvitationValidation.ts`

```typescript
interface UseInvitationValidationResult {
  isLoading: boolean;
  invitation: InvitationData | null;
  isValid: boolean;
  invalidReason: "expired" | "revoked" | "not_found" | "already_used" | null;
}

function useInvitationValidation(token: string | undefined): UseInvitationValidationResult
```

**Behavior:**
- If no token provided, returns `{ isLoading: false, invitation: null, isValid: false, invalidReason: null }`
- Calls `useQuery(api.registration.getInvitationByToken, { token })` when token is present
- Computes validity based on invitation status and expiration
- Reactive: updates if admin revokes the invitation while user is on the page

---

### `useAuthRedirect`

**File:** `ConvexPress-Website/apps/web/src/hooks/useAuthRedirect.ts`

```typescript
interface UseAuthRedirectResult {
  returnTo: string | null;          // Parsed returnTo URL from query params
  redirectAfterAuth: () => void;    // Navigate to returnTo or "/"
}

function useAuthRedirect(): UseAuthRedirectResult
```

**Behavior:**
- Parses `?returnTo=` from the current URL search params
- Validates the returnTo URL is a relative path (prevents open redirect attacks)
- `redirectAfterAuth()` navigates to the validated returnTo or falls back to "/"
- Sanitizes the URL to prevent XSS via javascript: or data: URIs

---

### `usePasswordStrength`

**File:** `ConvexPress-Website/apps/web/src/hooks/usePasswordStrength.ts`

```typescript
function usePasswordStrength(password: string): PasswordStrengthResult
```

**Behavior:**
- Computes password strength score (0-4) based on:
  - Length (< 8 = 0, 8-11 = +1, 12-15 = +2, 16+ = +3)
  - Character variety (uppercase, lowercase, numbers, symbols)
  - Common patterns (sequential, repeated chars, common passwords)
- Returns score, label, suggestions array, and meetsRequirements boolean
- Pure computation, no side effects

---

## Routes

### `/login` - Login Page

**File:** `ConvexPress-Website/apps/web/src/routes/login.tsx`
**Auth:** Public (redirects authenticated users)
**SSR:** Yes -- loader calls `getAuth()` for server-side redirect
**SEO:** `noindex` meta tag

**Loader:**
```typescript
loader: async () => {
  const { user } = await getAuth();
  if (user) {
    throw redirect({ to: "/" });
  }
  const signInUrl = await getSignInUrl();
  return { signInUrl };
}
```

**Component Structure:**
```
<AuthPageLayout title="Sign In" description="Sign in to access your account.">
  <OAuthButtons mode="signin" />
  <AuthDivider />
  <LoginForm signInUrl={signInUrl} />
  <AuthLink to="/register">Don't have an account? Create one</AuthLink>
</AuthPageLayout>
```

**Current State:** Partially implemented. Existing code renders a basic sign-in link using `signInUrl` from the auth system. Needs to be wrapped in AuthPageLayout with proper branding.

---

### `/register` - Registration Page

**File:** `ConvexPress-Website/apps/web/src/routes/register.tsx`
**Auth:** Public (redirects authenticated users)
**SSR:** Yes -- loader calls `getAuth()` for server-side redirect
**SEO:** `noindex` meta tag

**Loader:**
```typescript
loader: async () => {
  const { user } = await getAuth();
  if (user) {
    throw redirect({ to: "/" });
  }
  // Token validation happens client-side via Convex reactive query
  return {};
}
```

**Search Params:**
```typescript
const searchParams = z.object({
  token: z.string().optional(),     // Invitation token
});
```

**Component Structure:**
```
<AuthPageLayout title="Create Account" description="Join our community.">
  <RegistrationGate token={token}>
    <OAuthButtons mode="signup" />
    <AuthDivider />
    <RegisterForm invitation={invitation} />
  </RegistrationGate>
  <AuthLink to="/login">Already have an account? Sign in</AuthLink>
</AuthPageLayout>
```

---

### `/forgot-password` - Forgot Password Page

**File:** `ConvexPress-Website/apps/web/src/routes/forgot-password.tsx`
**Auth:** Public (redirects authenticated users to `/dashboard/settings`)
**SSR:** Yes
**SEO:** `noindex` meta tag

**Loader:**
```typescript
loader: async () => {
  const { user } = await getAuth();
  if (user) {
    throw redirect({ to: "/dashboard/settings" });
  }
  return {};
}
```

**Component Structure:**
```
<AuthPageLayout title="Forgot Password" description="Enter your email to receive a reset link.">
  {submitted ? (
    <ForgotPasswordSuccess email={submittedEmail} />
  ) : (
    <ForgotPasswordForm />
  )}
  <AuthLink to="/login">Back to Sign In</AuthLink>
</AuthPageLayout>
```

---

### `/reset-password` - Reset Password Page

**File:** `ConvexPress-Website/apps/web/src/routes/reset-password.tsx`
**Auth:** Public
**SSR:** Yes
**SEO:** `noindex` meta tag

**Note:** Convex Auth handles the password reset flow internally. The user clicks the reset link from their email, which goes to a Convex Auth-hosted page. ConvexPress may not need a custom `/reset-password` route unless Convex Auth is configured for a custom reset flow. This route exists as a placeholder for when headless password reset is implemented.

**Current Implementation:** May redirect to the auth system's built-in reset page. When headless flows are implemented, this page will render:
- New password input with PasswordStrengthIndicator
- Confirm password input
- Submit button ("Reset Password")
- Success message with redirect to login

---

### `/verify-email` - Email Verification Page

**File:** `ConvexPress-Website/apps/web/src/routes/verify-email.tsx`
**Auth:** Authenticated (user must be logged in but unverified)
**SSR:** Yes
**SEO:** `noindex` meta tag

**Note:** Convex Auth handles email verification natively. This page may show a "Please verify your email" message with a "Resend verification email" button, or it may not be needed if Convex Auth handles the entire flow. The route exists as a placeholder.

**Component Structure (when needed):**
```
<AuthPageLayout title="Verify Your Email" description="Check your inbox for a verification link.">
  <div>
    <MailCheck icon />
    <p>We sent a verification email to {user.email}.</p>
    <p>Click the link in the email to verify your account.</p>
    <Button onClick={resendVerification}>Resend Email</Button>
  </div>
  <AuthLink to="/">Go to homepage</AuthLink>
</AuthPageLayout>
```

---

### `/logout` - Logout Action

**File:** `ConvexPress-Website/apps/web/src/routes/logout.tsx`
**Auth:** Any
**SSR:** Yes -- can be handled as a server action

**Behavior:**
1. Call `signOut()` from Convex Auth
2. Clear any local state
3. Redirect to `/` (homepage)

**Note:** The existing header already has a sign-out button using `signOut()` from `useAuth()`. This route exists as a dedicated URL for cases like admin apps redirecting here, email links, etc.

---

### `/api/auth/callback` - Auth Callback

**File:** `ConvexPress-Website/apps/web/src/routes/api/auth/callback.tsx`
**Auth:** Public (processes OAuth return)
**SSR:** Server handler only (no UI)

**Current Implementation:** Already implemented. Uses `handleCallbackRoute()` from `@auth/authkit-tanstack-react-start`.

```typescript
export const Route = createFileRoute("/api/auth/callback")({
  server: {
    handlers: {
      GET: handleCallbackRoute(),
    },
  },
});
```

---

## Backend Integration

### Convex Queries Used (Read-Only -- Defined in Admin Backend)

| Query | Used By | Purpose |
|-------|---------|---------|
| `api.registration.canRegister` | RegistrationGate, useRegistrationGate | Check if self-registration is open |
| `api.registration.getInvitationByToken` | RegistrationGate, useInvitationValidation | Validate invitation token |
| `api.settings.get` | AuthPageLayout (logo URL), RegistrationGate | Read site settings |
| `api.users.getCurrentUser` | Header, authenticated page guards | Get current user profile |

### Convex Mutations Used (Defined in Admin Backend)

| Mutation | Used By | Purpose |
|----------|---------|---------|
| None directly | -- | Auth pages primarily use Auth APIs for auth actions, not Convex mutations |

### Server Actions (TanStack Start)

| Action | Used By | Purpose |
|--------|---------|---------|
| `forgotPasswordAction` | ForgotPasswordForm | Calls Auth API to initiate password reset + Convex `recordResetRequest` |

### Convex Auth APIs Used

| API | Used By | Import From |
|-----|---------|-------------|
| `getAuth()` | SSR loaders (login, register, forgot-password) | `@auth/authkit-tanstack-react-start` |
| `getSignInUrl()` | Login page loader | `@auth/authkit-tanstack-react-start` |
| `handleCallbackRoute()` | `/api/auth/callback` server handler | `@auth/authkit-tanstack-react-start` |
| `useAuth()` | Header, LoginForm, LogoutAction | `@auth/authkit-tanstack-react-start/client` |

---

## Accessibility

### Form Labels and Inputs

- Every `<Input>` MUST have an associated `<Label>` with matching `htmlFor`/`id` attributes
- Use `aria-describedby` to link inputs to their error messages
- Use `aria-invalid="true"` on inputs with validation errors
- Password inputs should have a show/hide toggle with `aria-label="Show password"` / `aria-label="Hide password"`

### Error Announcements

- Form-level errors should be wrapped in `role="alert"` for screen reader announcement
- Field-level errors should use `aria-live="polite"` or `aria-describedby` linkage
- The AuthError component includes `role="alert"` by default

### Focus Management

- On page load: focus the first interactive element (email input)
- On form submission error: focus the first field with an error
- On forgot-password success: focus the success message heading
- On registration gate change (e.g., registration closes while user is on page): focus the new message heading

### Keyboard Navigation

- All forms must be fully navigable via Tab/Shift+Tab
- Enter key submits the form
- OAuth buttons are focusable and activatable via Enter/Space
- Show/hide password toggle is focusable
- "Back to Sign In" and other links are standard `<a>` or `<Link>` elements

### Color Contrast

- All text meets WCAG AA contrast ratio (4.5:1 for normal text, 3:1 for large text)
- Error text (`text-destructive`) must have sufficient contrast against its background
- Password strength colors must be distinguishable without color alone (labels are always shown alongside the bar)

---

## Known Gaps & Decisions

### 1. Convex Auth vs Custom Headless Forms

**Gap:** The current implementation uses Convex Auth's redirect-based auth flow. All the custom form components (LoginForm, RegisterForm, etc.) are designed for the future headless implementation but are not yet functional as actual auth forms.

**Current State:** Login page renders a "Sign In with the auth system" link/button. Users are redirected to the auth system-hosted pages for actual authentication.

**Decision Needed:** When to implement custom headless auth forms? This depends on Convex Auth's headless API availability and the priority of removing the Convex Auth-hosted UI redirect.

**Recommendation:** Implement the layout and static components now (AuthPageLayout, OAuthButtons, PasswordStrengthIndicator). Keep the redirect-based flow as the primary auth mechanism. Add custom forms when headless Convex Auth becomes a priority.

### 2. Auth Page Background Design

**Gap:** No decision on whether auth pages should have a gradient, pattern, illustration, or plain background.

**Recommendation:** Start with a clean `bg-background` with subtle `bg-muted/5` treatment. Can be enhanced later via the theme configuration without touching auth components.

### 3. OAuth Provider Selection

**Gap:** Which OAuth providers to show (Google, GitHub, Microsoft, Apple, etc.) is not configured.

**Decision Needed:** This should be configurable via the Settings System. For now, show only the providers enabled in the Convex Auth dashboard.

**Recommendation:** Start with Google only. Add GitHub as a second option. Other providers can be enabled later in Convex Auth + reflected in OAuthButtons.

### 4. Terms of Service and Privacy Policy Links

**Gap:** No Terms of Service or Privacy Policy pages exist yet.

**Decision Needed:** Where do these link to? Internal pages (built via Page System) or external URLs?

**Recommendation:** Make the URLs configurable via Settings System (`settings.legal.termsUrl`, `settings.legal.privacyUrl`). Default to `#` with a note that they need to be configured.

### 5. Multi-Step Registration

**Gap:** If custom profile fields are added later (via Custom Field System), the registration form may need to become multi-step.

**Decision Needed:** Not needed for v1. The Registration System handles minimal registration (name + email + password). Extended profile setup happens post-registration in the user dashboard.

### 6. Social Login Error Handling

**Gap:** What happens when a user logs in with Google but already has an account with the same email registered via email/password?

**Decision:** Convex Auth handles this natively. It links OAuth identities to existing accounts based on verified email. No custom UI needed -- Convex Auth shows its own error messages during redirect flows.

### 7. Admin Redirect UX

**Gap:** The original blueprint mentioned a loading state between admin and website apps during cross-app login redirect.

**Resolution:** With Convex Auth, there is no cross-app redirect needed. Each app calls `signIn()` independently, and Convex Auth handles the redirect to each app's own callback URL. The admin app's `_authenticated.tsx` already handles the loading state: `<Loader />` while `authLoading || convexLoading`, then "Redirecting to login..." while `signIn()` is in progress.

### 8. Password Reset Flow Ownership

**Gap:** Convex Auth handles password reset via its own hosted pages. ConvexPress only records the `recordResetRequest` event for audit purposes. The `/reset-password` route may be unnecessary unless custom reset UI is built.

**Decision:** Keep the route file as a placeholder. For now, Convex Auth's built-in reset flow is sufficient. The Forgot Password page submits the email, Convex Auth sends the reset link, and Convex Auth handles the rest.

### 9. Email Verification Page

**Gap:** Convex Auth handles email verification natively. The `/verify-email` route may not be needed.

**Decision:** Keep as a placeholder. If Convex Auth's verification flow needs a custom landing page (e.g., "Your email has been verified! Click here to continue"), this route will serve that purpose.

### 10. Registration System Doc Alignment

**Important:** The Registration System expert doc (`REGISTRATION-SYSTEM.md`) may reference outdated auth provider components. The actual implementation uses Convex Auth equivalents:
- `<SignUp />` -> Custom RegisterForm component + Convex Auth `signIn()` with signup mode
- `clerkId` -> `clerkUserId`
- Webhooks -> auth webhook (via `@convex-dev/auth-authkit`)
- Signature verification -> Convex Auth native webhook verification

---

## Implementation Checklist

### Phase 1: Layout & Structure (Current Priority)

**Components:**
- [ ] `src/components/auth/AuthPageLayout.tsx` -- Shared auth page layout
- [ ] `src/components/auth/AuthDivider.tsx` -- "or" divider
- [ ] `src/components/auth/AuthLink.tsx` -- Navigation links between auth pages
- [ ] `src/components/auth/AuthError.tsx` -- Inline error display
- [ ] `src/components/auth/OAuthButtons.tsx` -- OAuth provider buttons
- [ ] `src/components/auth/PasswordStrengthIndicator.tsx` -- Password strength meter
- [ ] `src/components/auth/RegistrationGate.tsx` -- Registration mode checker
- [ ] `src/components/auth/RegistrationClosedMessage.tsx` -- Registration closed message
- [ ] `src/components/auth/InvitationRequiredMessage.tsx` -- Invite-only message
- [ ] `src/components/auth/InvitationInvalidMessage.tsx` -- Invalid invitation message
- [ ] `src/components/auth/ForgotPasswordForm.tsx` -- Email input for password reset
- [ ] `src/components/auth/ForgotPasswordSuccess.tsx` -- Reset email sent confirmation
- [ ] `src/components/auth/LoginForm.tsx` -- Login form (wraps Convex Auth signIn for now)
- [ ] `src/components/auth/RegisterForm.tsx` -- Registration form (wraps Convex Auth signIn for now)

**Hooks:**
- [ ] `src/hooks/useRegistrationGate.ts` -- Registration mode check
- [ ] `src/hooks/useInvitationValidation.ts` -- Invitation token validation
- [ ] `src/hooks/useAuthRedirect.ts` -- Return URL handling
- [ ] `src/hooks/usePasswordStrength.ts` -- Password strength computation

**Routes:**
- [ ] Update `src/routes/login.tsx` -- Wrap in AuthPageLayout with OAuthButtons
- [ ] Create `src/routes/register.tsx` -- Registration page with gate
- [ ] Create `src/routes/forgot-password.tsx` -- Forgot password flow
- [ ] Create `src/routes/logout.tsx` -- Logout action route

**Types:**
- [ ] `src/lib/auth/types.ts` -- TypeScript types for auth state

### Phase 2: Placeholder Routes

- [ ] Create `src/routes/reset-password.tsx` -- Placeholder for custom reset flow
- [ ] Create `src/routes/verify-email.tsx` -- Placeholder for verification landing

### Phase 3: Custom Headless Forms (Future)

- [ ] Implement actual email/password LoginForm with the auth system headless API
- [ ] Implement actual RegisterForm with the auth system headless API
- [ ] Implement custom password reset flow
- [ ] Implement custom email verification flow

---

## Edge Cases & Gotchas

1. **Redirect Loop Prevention:** If a user is authenticated but doesn't have a Convex user record yet (webhook hasn't fired), the login page may redirect to "/" which may redirect back to "/login" if "/" requires auth. Guard against this by allowing "/" to be accessible without a Convex user record.

2. **Invitation Token in URL:** When a user arrives at `/register?token=abc123`, the token should persist across page refreshes. Use URL search params (not component state) so the token survives a page reload during the registration process.

3. **Registration Gate Race Condition:** If an admin disables registration while a user is filling out the registration form, the form submission should gracefully fail with a "Registration is currently closed" error rather than a cryptic Convex error.

4. **signIn() During SSR:** The `signIn()` function from `useAuth()` is a client-side only function. Never call it in an SSR loader. The SSR loader should use `getAuth()` and `getSignInUrl()` from the server-side module.

5. **Open Redirect Prevention:** The `returnTo` parameter must be validated to be a relative URL. Reject absolute URLs, `javascript:`, `data:`, and any URL pointing to a different origin.

6. **Email Enumeration:** The forgot-password form ALWAYS shows the same success message regardless of whether the email exists. This prevents attackers from discovering valid email addresses.

7. **Multiple OAuth Identities:** Convex Auth automatically links OAuth accounts with the same verified email. If a user signs in with Google and later tries email/password with the same email, Convex Auth handles the linking. No custom UI needed.

8. **Browser Back Button:** After successful login, pressing the browser back button should not show the login form again (the SSR loader will redirect away). After logout, pressing back should not show authenticated content (auth checks in loaders prevent this).

9. **Convex Auth Rate Limiting:** Convex Auth has built-in rate limiting for auth attempts. If a user exceeds the limit, Convex Auth returns an error during the redirect flow. The callback handler should gracefully handle this and show an appropriate message.

10. **Cookie Domain:** Convex Auth uses `httpOnly` cookies set by `handleCallbackRoute()`. These cookies are scoped to the website app's domain. The admin app gets its own cookies via its own callback. No cross-domain cookie sharing is needed.

---

## Dependencies

### Depends On

| System | Type | Details |
|--------|------|---------|
| **Auth System** | Hard | Convex Auth integration, `useAuth()`, `getAuth()`, `getSignInUrl()`, `handleCallbackRoute()`. Every auth page depends on this. |
| **Registration System** | Hard | `canRegister` query, `getInvitationByToken` query. Registration gate depends entirely on this system. |
| **Password Management System** | Hard | Forgot password flow triggers `recordResetRequest`. Password strength requirements come from this system. |
| **Settings System** | Medium | Site logo URL, registration settings (anyoneCanRegister, defaultRole), legal page URLs (terms, privacy). |

### Depended On By

| System | Type | Details |
|--------|------|---------|
| **Admin Shell UI** | Medium | Admin app's `_authenticated.tsx` calls `signIn()` which redirects through Convex Auth. Understanding the auth flow helps admin UI experts. |
| **Website Layout UI** | Medium | Header component shows sign-in/sign-out based on auth state from `useAuth()`. |
| **Website User Dashboard UI** | Soft | Dashboard pages depend on the user being authenticated via the same auth flow. |

### External Dependencies

| Dependency | Purpose |
|-----------|---------|
| **Convex Auth** | Auth provider -- all login, signup, password reset, email verification |
| **@auth/authkit-tanstack-react-start** | TanStack Start integration for Convex Auth (SSR loaders + client hooks) |
| **@base-ui/react** | UI primitives (Button, Input, Checkbox) used in auth forms |
| **TanStack Form** | Form state management with Zod validation |
| **Zod** | Schema validation for form inputs |
| **Convex** | Reactive queries for registration gate and invitation validation |
| **Lucide React** | Icons (mail, lock, eye, check, alert, etc.) |
| **Sonner** | Toast notifications (success/error on form submission) |

---

## Existing Code Reference

### Currently Implemented Files

| File | Status | Notes |
|------|--------|-------|
| `ConvexPress-Website/apps/web/src/routes/login.tsx` | Minimal | Basic sign-in link, uses `getAuth()` + `getSignInUrl()`. Needs AuthPageLayout wrapper. |
| `ConvexPress-Website/apps/web/src/routes/api/auth/callback.tsx` | Complete | `handleCallbackRoute()` -- fully functional, do not modify. |
| `ConvexPress-Website/apps/web/src/routes/__root.tsx` | Complete | `AuthKitProvider` + `ConvexProvider` wrapping -- do not modify. |
| `ConvexPress-Website/apps/web/src/components/header.tsx` | Complete | Sign-in/sign-out buttons using `useAuth()` -- reference for auth state usage. |

### UI Component Patterns (Match These)

All auth page components should follow the patterns established in the existing UI components:

- **Button:** Uses `@base-ui/react/button` via `ButtonPrimitive`. Uses `cva` for variants. File: `src/components/ui/button.tsx`
- **Input:** Uses `@base-ui/react/input` via `InputPrimitive`. File: `src/components/ui/input.tsx`
- **Card:** Uses standard `div` elements with `data-slot` attributes. File: `src/components/ui/card.tsx`
- **Checkbox:** Uses `@base-ui/react/checkbox`. File: `src/components/ui/checkbox.tsx`
- **All colors via CSS variables** -- `bg-card`, `text-foreground`, `text-muted-foreground`, `bg-muted`, `border-border`, `text-destructive`, `bg-primary`, `text-primary-foreground`, etc.
- **No rounded corners** -- `rounded-none` is the default across all components
- **Text size** -- Default is `text-xs` for body, `text-sm` for headings within cards
- **Utility function:** `cn()` from `@/lib/utils` for class merging (uses `clsx` + `tailwind-merge`)

### Package Dependencies (Already Installed)

These packages are already available in `ConvexPress-Website/apps/web/package.json`:
- `@base-ui/react` -- UI primitives
- `@auth/authkit-tanstack-react-start` -- Auth integration
- `@tanstack/react-form` -- Form management
- `class-variance-authority` -- Component variants
- `clsx` + `tailwind-merge` -- Class utilities
- `lucide-react` -- Icons
- `sonner` -- Toast notifications
- `zod` -- Validation
- `convex` -- Database client
