/**
 * Invite a control-plane operator with the narrowest useful scope and hand
 * back a one-time claim code, shown exactly once.
 */

import { api as controlApi } from "@control/convex/_generated/api";
import type { Id } from "@control/convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { Check, Copy, Loader2, UserPlus } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { generateControlClaimSecret } from "../../auth-client";
import type { WorkspaceApi } from "../SitesWorkspace";
import { Notice, SelectField, TextField } from "../forms";
import { friendlyError } from "../useWorkspaceActions";

type Profile = "administrator" | "business-manager" | "site-operator" | "member" | "viewer";

const PROFILES: Array<{ value: Profile; label: string; hint: string }> = [
  { value: "administrator", label: "Administrator — every organization", hint: "Everything in this installation." },
  { value: "business-manager", label: "Business Manager — one business", hint: "Manages every website in the chosen business." },
  { value: "site-operator", label: "Site Operator — one website", hint: "Operates one website and its environments." },
  { value: "member", label: "Member — one website", hint: "Edits content on one website." },
  { value: "viewer", label: "Viewer — one website, read-only", hint: "Reads one website without changing it." },
];

export function InviteOperatorDialog({
  api,
  organizationId,
  businessId,
  websiteId,
}: {
  api: WorkspaceApi;
  organizationId?: string;
  businessId?: string;
  websiteId?: string;
}) {
  const provision = useMutation(controlApi.operators.provisionScoped);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [profile, setProfile] = useState<Profile>(websiteId ? "viewer" : businessId ? "business-manager" : "viewer");
  const [targetBusiness, setTargetBusiness] = useState(businessId ?? "");
  const [targetWebsite, setTargetWebsite] = useState(websiteId ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{ email: string; claimSecret: string; expiresAt: number } | null>(null);
  const [copied, setCopied] = useState(false);

  const needsBusiness = profile === "business-manager";
  const needsWebsite = profile === "site-operator" || profile === "member" || profile === "viewer";
  const businesses = api.tree.flatMap((organization) =>
    organization.businesses.map((business) => ({
      value: business.businessId,
      label: `${organization.name} › ${business.name}`,
    })),
  );
  const websites = api.tree.flatMap((organization) =>
    organization.businesses.flatMap((business) =>
      business.websites.map((website) => ({
        value: website.websiteId,
        label: `${business.name} › ${website.title}`,
      })),
    ),
  );
  const resolvedBusiness = targetBusiness || businesses[0]?.value || "";
  const resolvedWebsite = targetWebsite || websites[0]?.value || "";
  const targetReady = (!needsBusiness || resolvedBusiness) && (!needsWebsite || resolvedWebsite);
  void organizationId;

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && api.closeDialog()}>
      <DialogContent className="max-w-lg">
        {receipt ? (
          <>
            <DialogHeader>
              <DialogTitle className="font-serif text-[26px] font-normal leading-none tracking-[-0.01em]">
                Invitation ready
              </DialogTitle>
              <DialogDescription className="text-[13.5px] leading-6">
                Share this one-time code with {receipt.email} through a secure channel. It is shown only
                now and expires {new Date(receipt.expiresAt).toLocaleString()}.
              </DialogDescription>
            </DialogHeader>
            <aside
              aria-label="One-time operator invitation"
              className="rounded-lg border border-warning/50 bg-warning-soft p-3.5"
            >
              <p className="eyebrow text-warning">Copy now · shown only in this session</p>
              <p className="mt-1.5 text-[12.5px] text-ink-2">
                Invitation for <span className="font-medium text-foreground">{receipt.email}</span>
              </p>
              <div className="mt-2 flex items-center gap-2">
                <output className="min-w-0 flex-1 break-all rounded-md border border-warning/40 bg-card px-2.5 py-2 font-mono text-[12.5px] text-foreground select-all">
                  {receipt.claimSecret}
                </output>
                <Button
                  size="icon"
                  variant="outline"
                  aria-label="Copy invitation code"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(receipt.claimSecret);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    } catch {
                      // clipboard unavailable
                    }
                  }}
                >
                  {copied ? <Check aria-hidden="true" className="text-success" /> : <Copy aria-hidden="true" />}
                </Button>
              </div>
            </aside>
            <p className="text-[13px] leading-5 text-ink-2">
              The invitee opens ConvexPress, chooses “Have an operator invitation? Claim it”, and enters
              their email, this code, and a new password.
            </p>
            <DialogFooter>
              <Button onClick={api.closeDialog}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <form
            aria-label="Invite operator"
            className="contents"
            onSubmit={(event) => {
              event.preventDefault();
              if (!targetReady) return;
              setBusy(true);
              setError(null);
              void api
                .run(
                  "provision-operator",
                  async () => {
                    const claimSecret = generateControlClaimSecret();
                    const result = await provision({
                      email,
                      ...(name.trim() ? { name } : {}),
                      profile,
                      claimSecret,
                      ...(needsBusiness ? { businessId: resolvedBusiness as Id<"overseer_businesses"> } : {}),
                      ...(needsWebsite ? { websiteId: resolvedWebsite as Id<"overseer_websites"> } : {}),
                    });
                    setReceipt({
                      email: email.trim().toLowerCase(),
                      claimSecret: result.claimSecret,
                      expiresAt: result.claimExpiresAt,
                    });
                    return `${PROFILES.find((p) => p.value === profile)?.label.split(" — ")[0] ?? "Operator"} invitation prepared. Share the one-time code through a secure channel.`;
                  },
                )
                .then((result) => {
                  setBusy(false);
                  if (!result.ok) setError(result.error ?? friendlyError(new Error("failed")));
                });
            }}
          >
            <DialogHeader>
              <DialogTitle className="font-serif text-[26px] font-normal leading-none tracking-[-0.01em]">
                Invite an operator
              </DialogTitle>
              <DialogDescription className="text-[13.5px] leading-6">
                Assign the narrowest scope that does the job. Everything is re-authorized by the control
                plane on every request.
              </DialogDescription>
            </DialogHeader>
            {error && <Notice tone="error">{error}</Notice>}
            <div className="grid gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField label="Name" value={name} onChange={setName} optional autoFocus />
                <TextField label="Login email" value={email} onChange={setEmail} type="email" required autoComplete="off" />
              </div>
              <SelectField
                label="Outer access role"
                value={profile}
                onChange={setProfile}
                options={PROFILES.map((option) => ({ value: option.value, label: option.label }))}
                hint={PROFILES.find((option) => option.value === profile)?.hint}
              />
              {needsBusiness && (
                <SelectField label="Business" value={resolvedBusiness} onChange={setTargetBusiness} options={businesses} />
              )}
              {needsWebsite && (
                <SelectField label="Website" value={resolvedWebsite} onChange={setTargetWebsite} options={websites} />
              )}
              {!targetReady && (
                <Notice tone="info">Create the business or website this operator should reach first.</Notice>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" disabled={busy} onClick={api.closeDialog}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy || !email.trim() || !targetReady}>
                {busy ? (
                  <Loader2 data-icon="inline-start" className="animate-spin" aria-hidden="true" />
                ) : (
                  <UserPlus data-icon="inline-start" aria-hidden="true" />
                )}
                Prepare operator invitation
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
