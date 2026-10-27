/**
 * The top of the Security page: two-step verification (set it up, see what's
 * on, turn a method off, get new backup codes) and the devices signed in to
 * the account (sign one out, or every other one). Shown when the site signs
 * people in with Clerk.
 */
import { KeyRound, LogOut, MessageSquareText, Monitor, ShieldCheck, ShieldOff, Smartphone } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";

import { DashboardCard } from "@/components/dashboard/DashboardCard";
import { Button } from "@/components/ui/button";
import { useAuthCapabilities } from "@/contexts/AuthConfigContext";
import { useSiteIdentity } from "@/hooks/layout/useSiteIdentity";
import { lastActiveLabel, maskPhoneNumber, orderSessions, twoFactorErrorMessage, type DeviceSession } from "@/lib/auth/two-factor";

import { BackupCodesList, TwoFactorSetup } from "./TwoFactorSetup";
import { useAccountSecurity, type AccountSecurity } from "./useAccountSecurity";

export function AccountProtection() {
  const security = useAccountSecurity();
  const site = useSiteIdentity();
  if (!security) return null;
  const siteName = site?.title ?? "your account";
  return (
    <div className="space-y-4">
      <TwoStepVerificationCard security={security} siteName={siteName} />
      <DeviceSessionsCard security={security} />
    </div>
  );
}

type Removal = { kind: "authenticator" } | { kind: "phone"; id: string; phoneNumber: string };

function MethodRow({ icon, title, detail, action }: { icon: ReactNode; title: string; detail: string; action?: ReactNode }) {
  return (
    <li className="flex flex-wrap items-center gap-3 border-b border-border/50 py-3 last:border-b-0">
      <span className="flex size-8 shrink-0 items-center justify-center bg-primary/10 text-primary">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </div>
      {action}
    </li>
  );
}

export function TwoStepVerificationCard({ security, siteName }: { security: AccountSecurity; siteName: string }) {
  const { status, enrollment } = security;
  const { options } = enrollment;
  const required = useAuthCapabilities().signIn.secondFactorRequired;
  const [settingUp, setSettingUp] = useState(false);
  const [removing, setRemoving] = useState<Removal | null>(null);
  const [newCodes, setNewCodes] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(twoFactorErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const methods = Number(status.authenticator) + status.phones.length;
  const canAdd = (options.authenticatorApp && !status.authenticator) || (options.textMessage && status.phones.length === 0);
  const available = options.authenticatorApp || options.textMessage;

  if (settingUp) {
    return (
      <DashboardCard title="Two-step verification">
        <TwoFactorSetup
          enrollment={enrollment}
          siteName={siteName}
          onDone={() => {
            setSettingUp(false);
            setNotice("Two-step verification is on.");
          }}
          onCancel={() => setSettingUp(false)}
        />
      </DashboardCard>
    );
  }

  const removeLast = removing !== null && methods === 1;
  return (
    <DashboardCard
      title="Two-step verification"
      description={
        status.on
          ? "Signing in on a new device takes your password and a code from your phone."
          : "Add a code from your phone to each sign-in on a new device, so a password alone can't open your account."
      }
      action={
        <span
          className={
            status.on
              ? "bg-success/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-success"
              : "bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
          }
        >
          {status.on ? "On" : "Off"}
        </span>
      }
    >
      <div className="space-y-4">
        {error ? (
          <p role="alert" className="border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <p role="status" aria-live="polite" className={notice ? "text-sm text-foreground" : "sr-only"}>
          {notice}
        </p>

        {status.on ? (
          <ul aria-label="Two-step methods">
            {status.authenticator ? (
              <MethodRow
                icon={<Smartphone className="size-4" aria-hidden="true" />}
                title="Authenticator app"
                detail="Codes from an app on your phone."
                action={
                  <Button variant="outline" size="sm" disabled={busy} onClick={() => setRemoving({ kind: "authenticator" })}>
                    Turn off
                  </Button>
                }
              />
            ) : null}
            {status.phones.map((phone) => (
              <MethodRow
                key={phone.id}
                icon={<MessageSquareText className="size-4" aria-hidden="true" />}
                title="Text messages"
                detail={`Codes texted to ${maskPhoneNumber(phone.phoneNumber)}.`}
                action={
                  <Button variant="outline" size="sm" disabled={busy} onClick={() => setRemoving({ kind: "phone", ...phone })}>
                    Stop
                  </Button>
                }
              />
            ))}
            {status.backupCodes || options.backupCodes ? (
              <MethodRow
                icon={<KeyRound className="size-4" aria-hidden="true" />}
                title="Backup codes"
                detail={status.backupCodes ? "One-time codes for when you can't get a code." : "Not issued yet."}
                action={
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        setNewCodes(await enrollment.createBackupCodes());
                        setNotice("New backup codes issued. Any earlier codes no longer work.");
                      })
                    }
                  >
                    {status.backupCodes ? "Get new codes" : "Get codes"}
                  </Button>
                }
              />
            ) : null}
          </ul>
        ) : null}

        {newCodes ? (
          <div className="space-y-3 border border-border bg-muted/20 p-3">
            <p className="text-sm font-medium text-foreground">Your new backup codes</p>
            <p className="text-xs text-muted-foreground">Each code signs you in once. Save them now: they won't be shown again.</p>
            <BackupCodesList codes={newCodes} siteName={siteName} onNotice={setNotice} />
            <Button size="sm" variant="ghost" onClick={() => setNewCodes(null)}>
              I've saved them
            </Button>
          </div>
        ) : null}

        {removing ? (
          <div role="alertdialog" aria-label="Turn off a two-step method" className="space-y-3 border border-border bg-muted/20 p-3">
            <p className="text-sm font-medium text-foreground">
              {removing.kind === "authenticator"
                ? "Turn off the authenticator app?"
                : `Stop texting codes to ${maskPhoneNumber(removing.phoneNumber)}?`}
            </p>
            <p className="text-xs text-muted-foreground">
              {removeLast
                ? required
                  ? "That's your only method. This site asks for two-step verification, so you'll set it up again at your next sign-in."
                  : "That's your only method: two-step verification will be off, and your password alone will sign you in."
                : "You'll still sign in with your other method."}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="destructive"
                size="sm"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    if (removing.kind === "authenticator") await security.removeAuthenticator();
                    else await security.stopTexting(removing.id);
                    setRemoving(null);
                    setNotice(removeLast ? "Two-step verification is off." : "That method is off.");
                  })
                }
              >
                <ShieldOff className="size-3.5" aria-hidden="true" />
                {busy ? "Turning off…" : "Turn it off"}
              </Button>
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => setRemoving(null)}>
                Keep it
              </Button>
            </div>
          </div>
        ) : null}

        {!available && !status.on ? (
          <p className="text-sm text-muted-foreground">Two-step verification isn't available on this site yet.</p>
        ) : canAdd && !removing ? (
          <Button
            variant={status.on ? "outline" : "default"}
            size="sm"
            onClick={() => {
              setNotice(null);
              setNewCodes(null);
              setSettingUp(true);
            }}
          >
            <ShieldCheck className="size-3.5" aria-hidden="true" />
            {status.on ? "Add another method" : "Set up two-step verification"}
          </Button>
        ) : null}
      </div>
    </DashboardCard>
  );
}

export function DeviceSessionsCard({ security }: { security: AccountSecurity }) {
  const [sessions, setSessions] = useState<DeviceSession[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { loadSessions } = security;

  const refresh = useCallback(async () => {
    try {
      setSessions(orderSessions(await loadSessions()));
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [loadSessions]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const act = async (key: string, action: () => Promise<string>) => {
    setBusy(key);
    try {
      setNotice(await action());
      await refresh();
    } catch (cause) {
      setNotice(twoFactorErrorMessage(cause));
    } finally {
      setBusy(null);
    }
  };

  const others = sessions?.filter((session) => !session.current) ?? [];
  const now = Date.now();
  return (
    <DashboardCard
      title="Where you're signed in"
      description="Sign out a device you don't recognize, or one you no longer use."
      action={
        others.length > 0 ? (
          <Button
            variant="outline"
            size="sm"
            disabled={busy !== null}
            onClick={() =>
              void act("others", async () => {
                const count = await security.signOutOtherSessions();
                return count === 1 ? "Signed out of 1 other device." : `Signed out of ${count} other devices.`;
              })
            }
          >
            <LogOut className="size-3.5" aria-hidden="true" />
            {busy === "others" ? "Signing out…" : "Sign out other devices"}
          </Button>
        ) : undefined
      }
    >
      <p role="status" aria-live="polite" className={notice ? "mb-2 text-sm text-foreground" : "sr-only"}>
        {notice}
      </p>
      {failed ? (
        <p className="text-sm text-muted-foreground">Your devices couldn't be loaded. Refresh the page to try again.</p>
      ) : sessions === null ? (
        <p className="text-sm text-muted-foreground">Loading your devices…</p>
      ) : (
        <ul aria-label="Signed-in devices">
          {sessions.map((session) => (
            <li key={session.id} className="flex flex-wrap items-center gap-3 border-b border-border/50 py-3 last:border-b-0">
              <span className="flex size-8 shrink-0 items-center justify-center bg-muted text-muted-foreground">
                <Monitor className="size-4" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">
                  {session.device}
                  {session.current ? <span className="ml-2 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">This device</span> : null}
                </p>
                <p className="text-xs text-muted-foreground">
                  {[session.place, session.current ? "Active now" : lastActiveLabel(session.lastActiveAt, now)].filter(Boolean).join(" · ")}
                </p>
              </div>
              {session.current ? null : (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy !== null}
                  onClick={() =>
                    void act(session.id, async () => {
                      await security.signOutSession(session.id);
                      return `Signed out of ${session.device}.`;
                    })
                  }
                >
                  {busy === session.id ? "Signing out…" : "Sign out"}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </DashboardCard>
  );
}
