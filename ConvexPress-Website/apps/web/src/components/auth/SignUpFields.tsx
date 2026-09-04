/**
 * SignUpFields — the registration inputs, driven by what Clerk accepts.
 *
 * Renders only enabled fields, marks the ones Clerk requires, and can be
 * narrowed to a subset (`only`) when Clerk asks for missing fields after an
 * OAuth transfer or a partial sign-up.
 */

import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signUpFields, type AuthCapabilities, type SignUpFieldName } from "@/lib/auth/capabilities";

import { PasswordStrengthIndicator } from "./PasswordStrengthIndicator";

export type SignUpFieldValues = Record<SignUpFieldName, string> & { confirmPassword: string };

export function emptySignUpValues(): SignUpFieldValues {
  return {
    emailAddress: "",
    phoneNumber: "",
    username: "",
    firstName: "",
    lastName: "",
    password: "",
    confirmPassword: "",
  };
}

const LABELS: Record<SignUpFieldName, string> = {
  emailAddress: "Email",
  phoneNumber: "Phone number",
  username: "Username",
  firstName: "First name",
  lastName: "Last name",
  password: "Password",
};

const PLACEHOLDERS: Record<SignUpFieldName, string> = {
  emailAddress: "you@example.com",
  phoneNumber: "+1 555 123 4567",
  username: "yourname",
  firstName: "Jane",
  lastName: "Doe",
  password: "Create a password",
};

const AUTOCOMPLETE: Record<SignUpFieldName, string> = {
  emailAddress: "email",
  phoneNumber: "tel",
  username: "username",
  firstName: "given-name",
  lastName: "family-name",
  password: "new-password",
};

export interface SignUpFieldsProps {
  capabilities: AuthCapabilities;
  values: SignUpFieldValues;
  onChange: (next: SignUpFieldValues) => void;
  /** Restrict to these fields (all still-enabled ones when omitted). */
  only?: SignUpFieldName[];
  /** Fields that cannot be edited (e.g. invitation email). */
  locked?: Partial<Record<SignUpFieldName, string>>;
  idPrefix?: string;
  autoFocus?: boolean;
}

export function SignUpFields({
  capabilities,
  values,
  onChange,
  only,
  locked,
  idPrefix = "register",
  autoFocus = true,
}: SignUpFieldsProps) {
  const [showPassword, setShowPassword] = useState(false);
  const fields = signUpFields(capabilities).filter((field) => !only || only.includes(field.name));
  const names = fields.filter((field) => field.name === "firstName" || field.name === "lastName");
  const rest = fields.filter((field) => field.name !== "firstName" && field.name !== "lastName");
  let focused = false;

  const set = (name: keyof SignUpFieldValues, value: string) => onChange({ ...values, [name]: value });

  const renderText = (name: SignUpFieldName, required: boolean) => {
    const shouldFocus = autoFocus && !focused;
    if (shouldFocus) focused = true;
    const id = `${idPrefix}-${name}`;
    const lockedValue = locked?.[name];
    return (
      <div key={name} className="flex flex-col gap-1.5">
        <Label htmlFor={id}>
          {LABELS[name]}
          {!required && <span className="ml-1 text-[11px] font-normal text-muted-foreground">(optional)</span>}
        </Label>
        <Input
          id={id}
          type={name === "emailAddress" ? "email" : name === "phoneNumber" ? "tel" : "text"}
          inputMode={name === "phoneNumber" ? "tel" : undefined}
          placeholder={PLACEHOLDERS[name]}
          value={lockedValue ?? values[name]}
          onChange={(event) => set(name, event.target.value)}
          autoComplete={AUTOCOMPLETE[name]}
          autoFocus={shouldFocus}
          required={required}
          disabled={lockedValue !== undefined}
          aria-describedby={lockedValue !== undefined ? `${id}-note` : undefined}
        />
        {lockedValue !== undefined && (
          <p id={`${id}-note`} className="text-xs text-muted-foreground">
            Pre-filled from your invitation.
          </p>
        )}
      </div>
    );
  };

  const renderPassword = (required: boolean) => (
    <div key="password" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${idPrefix}-password`}>
          Password
          {!required && <span className="ml-1 text-[11px] font-normal text-muted-foreground">(optional)</span>}
        </Label>
        <div className="relative">
          <Input
            id={`${idPrefix}-password`}
            type={showPassword ? "text" : "password"}
            placeholder={PLACEHOLDERS.password}
            value={values.password}
            onChange={(event) => set("password", event.target.value)}
            autoComplete="new-password"
            required={required}
            className="pr-8"
          />
          <button
            type="button"
            onClick={() => setShowPassword((current) => !current)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? <EyeOff className="size-3.5" aria-hidden="true" /> : <Eye className="size-3.5" aria-hidden="true" />}
          </button>
        </div>
        <PasswordStrengthIndicator password={values.password} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${idPrefix}-confirm-password`}>Confirm password</Label>
        <Input
          id={`${idPrefix}-confirm-password`}
          type={showPassword ? "text" : "password"}
          placeholder="Confirm your password"
          value={values.confirmPassword}
          onChange={(event) => set("confirmPassword", event.target.value)}
          autoComplete="new-password"
          required={required}
          aria-invalid={values.confirmPassword.length > 0 && values.password !== values.confirmPassword ? true : undefined}
        />
        {values.confirmPassword.length > 0 && values.password !== values.confirmPassword && (
          <p className="text-xs text-destructive" aria-live="polite">
            Passwords don't match
          </p>
        )}
      </div>
    </div>
  );

  return (
    <>
      {names.length > 0 && (
        <div className={names.length === 2 ? "grid grid-cols-2 gap-3" : "grid gap-3"}>
          {names.map((field) => renderText(field.name, field.required))}
        </div>
      )}
      {rest.map((field) => (field.name === "password" ? renderPassword(field.required) : renderText(field.name, field.required)))}
    </>
  );
}

/** Client-side completeness check mirroring Clerk's required flags. */
export function missingRequiredFields(
  capabilities: AuthCapabilities,
  values: SignUpFieldValues,
  only?: SignUpFieldName[],
): SignUpFieldName[] {
  return signUpFields(capabilities)
    .filter((field) => (!only || only.includes(field.name)) && field.required && !values[field.name]?.trim())
    .map((field) => field.name);
}
