/**
 * LegalConsent — the "I agree" checkbox, shown only when Clerk requires legal
 * consent for sign-up. Links come from Clerk's configuration when present.
 */

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { AuthCapabilities } from "@/lib/auth/capabilities";

export function LegalConsent({
  capabilities,
  checked,
  onChange,
  id = "register-legal-consent",
}: {
  capabilities: AuthCapabilities;
  checked: boolean;
  onChange: (next: boolean) => void;
  id?: string;
}) {
  const { termsUrl, privacyPolicyUrl } = capabilities.links;
  const link = (href: string | null, label: string) =>
    href ? (
      <a href={href} className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
        {label}
      </a>
    ) : (
      <span>{label}</span>
    );
  return (
    <div className="flex items-start gap-2">
      <Checkbox id={id} checked={checked} onCheckedChange={(value) => onChange(value === true)} className="mt-0.5" />
      <Label htmlFor={id} className="cursor-pointer leading-normal">
        I agree to the {link(termsUrl, "Terms of Service")} and {link(privacyPolicyUrl, "Privacy Policy")}
      </Label>
    </div>
  );
}
