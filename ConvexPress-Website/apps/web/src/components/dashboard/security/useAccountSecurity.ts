/**
 * The Security page's Clerk calls, behind one interface so the screens can be
 * tested without Clerk: setting up two-step verification, what's on now,
 * turning a method off, new backup codes, and the devices signed in.
 */
import { useMemo } from "react";

import { useAuthConfig } from "@/contexts/AuthConfigContext";
import { useClerk, useClerkActive, useUser } from "@/lib/auth/clerk";
import { describeDevice, describePlace, secondFactorOptions, type DeviceSession, type SecondFactorOptions } from "@/lib/auth/two-factor";

/** Setting up a second factor. */
export interface TwoFactorEnrollment {
  options: SecondFactorOptions;
  /** A verified phone on the account that doesn't receive codes yet. */
  verifiedPhone: { id: string; phoneNumber: string } | null;
  /** Start an authenticator enrollment: the otpauth:// URI and its key. */
  createTotp(): Promise<{ uri?: string; secret?: string }>;
  /** Confirm the first code; Clerk may return backup codes with it. */
  verifyTotp(code: string): Promise<{ verified: boolean; backupCodes?: string[] }>;
  /** Text a code to a new number (E.164); returns the phone to verify. */
  sendPhoneCode(phoneNumber: string): Promise<{ id: string; phoneNumber: string }>;
  /** Text a new code to a phone already added. */
  resendPhoneCode(phoneId: string): Promise<void>;
  /** Confirm the texted code, then use the phone for sign-in codes. */
  verifyPhoneCode(phoneId: string, code: string): Promise<void>;
  /** Use a verified phone for sign-in codes. */
  usePhone(phoneId: string): Promise<void>;
  /** Issue a fresh set of backup codes (replacing any earlier set). */
  createBackupCodes(): Promise<string[]>;
  /** Enrolled: refresh what the page knows about the account. */
  finish(): Promise<void>;
}

/** What protects the account now. */
export interface TwoStepStatus {
  on: boolean;
  authenticator: boolean;
  backupCodes: boolean;
  /** Phones that receive sign-in codes. */
  phones: Array<{ id: string; phoneNumber: string }>;
}

export interface AccountSecurity {
  status: TwoStepStatus;
  enrollment: TwoFactorEnrollment;
  removeAuthenticator(): Promise<void>;
  stopTexting(phoneId: string): Promise<void>;
  loadSessions(): Promise<DeviceSession[]>;
  signOutSession(sessionId: string): Promise<void>;
  /** Sign out every device but this one; returns how many were signed out. */
  signOutOtherSessions(): Promise<number>;
}

/** Clerk's user and session APIs as AccountSecurity; null without Clerk or a signed-in user. */
export function useAccountSecurity(): AccountSecurity | null {
  const active = useClerkActive();
  const { user } = useUser();
  const clerk = useClerk();
  const config = useAuthConfig();

  return useMemo(() => {
    if (!active || !user) return null;
    const options = secondFactorOptions(config.capabilities, config.capabilitiesSyncedAt);
    const phone = (id: string) => {
      const found = user.phoneNumbers.find((candidate) => candidate.id === id);
      if (!found) throw new Error("That phone number is no longer on the account");
      return found;
    };
    const reserve = async (id: string) => {
      const reserved = await phone(id).setReservedForSecondFactor({ reserved: true });
      await reserved.makeDefaultSecondFactor();
      await user.reload();
    };
    const codePhones = user.phoneNumbers
      .filter((candidate) => candidate.reservedForSecondFactor)
      .map((candidate) => ({ id: candidate.id, phoneNumber: candidate.phoneNumber }));
    const verified = user.phoneNumbers.find(
      (candidate) => candidate.verification.status === "verified" && !candidate.reservedForSecondFactor,
    );
    const sessions = async () => await user.getSessions();
    const currentId = clerk.session?.id ?? null;

    const enrollment: TwoFactorEnrollment = {
      options,
      verifiedPhone: verified ? { id: verified.id, phoneNumber: verified.phoneNumber } : null,
      createTotp: async () => {
        const totp = await user.createTOTP();
        return { uri: totp.uri, secret: totp.secret };
      },
      verifyTotp: async (code) => {
        const totp = await user.verifyTOTP({ code });
        return { verified: totp.verified, backupCodes: totp.backupCodes };
      },
      sendPhoneCode: async (phoneNumber) => {
        const existing = user.phoneNumbers.find((candidate) => candidate.phoneNumber === phoneNumber);
        const added = existing ?? (await user.createPhoneNumber({ phoneNumber }));
        await added.prepareVerification();
        return { id: added.id, phoneNumber: added.phoneNumber };
      },
      resendPhoneCode: async (phoneId) => {
        await phone(phoneId).prepareVerification();
      },
      verifyPhoneCode: async (phoneId, code) => {
        const checked = await phone(phoneId).attemptVerification({ code });
        if (checked.verification.status !== "verified") throw new Error("The code wasn't accepted");
        await user.reload();
        await reserve(phoneId);
      },
      usePhone: reserve,
      createBackupCodes: async () => {
        const codes = (await user.createBackupCode()).codes;
        await user.reload();
        return codes;
      },
      finish: async () => {
        await user.reload();
      },
    };

    return {
      status: {
        on: user.twoFactorEnabled,
        authenticator: user.totpEnabled,
        backupCodes: user.backupCodeEnabled,
        phones: codePhones,
      },
      enrollment,
      removeAuthenticator: async () => {
        await user.disableTOTP();
        await user.reload();
      },
      stopTexting: async (phoneId) => {
        await phone(phoneId).setReservedForSecondFactor({ reserved: false });
        await user.reload();
      },
      loadSessions: async () =>
        (await sessions()).map((session) => ({
          id: session.id,
          current: session.id === currentId,
          device: describeDevice(session.latestActivity),
          place: describePlace(session.latestActivity),
          lastActiveAt: session.lastActiveAt.getTime(),
        })),
      signOutSession: async (sessionId) => {
        const target = (await sessions()).find((session) => session.id === sessionId);
        if (!target) return;
        await target.revoke();
      },
      signOutOtherSessions: async () => {
        const others = (await sessions()).filter((session) => session.id !== currentId);
        await Promise.all(others.map((session) => session.revoke()));
        return others.length;
      },
    };
  }, [active, user, clerk, config.capabilities, config.capabilitiesSyncedAt]);
}
