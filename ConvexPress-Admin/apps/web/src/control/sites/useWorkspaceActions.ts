/**
 * Runs a workspace action with a single pending key and a workspace-level
 * notice. Success messages auto-clear; errors stay until the next action.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export interface WorkspaceNotice {
  tone: "success" | "error";
  message: string;
}

export function friendlyError(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : String(cause);
  if (/not authorized|no_matching_grant|explicit_deny/i.test(message)) {
    return "Your role is not authorized for that change.";
  }
  if (/already exists|already attached/i.test(message)) {
    return "That key, domain, or deployment address is already registered.";
  }
  if (/Revoke the active connection/i.test(message)) {
    return "Revoke the active controller connection before changing or archiving this environment.";
  }
  if (/Archive every environment/i.test(message)) {
    return "Archive every environment of this website first.";
  }
  if (/credential prompt|ConvexPress Desktop|protected operator session/i.test(message)) {
    return message;
  }
  if (/Connection could not be created/i.test(message)) {
    return "The deployment identity or admin key could not be verified.";
  }
  if (/confirmation does not match/i.test(message)) {
    return "The confirmation phrase does not match.";
  }
  if (/Invalid (hierarchy|website|portable)/i.test(message)) {
    return message.replace(/^Invalid /u, "Check the ") + ".";
  }
  return "That change could not be completed. Check the values and try again.";
}

export function useWorkspaceActions() {
  const [pending, setPending] = useState<string | null>(null);
  const [notice, setNotice] = useState<WorkspaceNotice | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const clearNotice = useCallback(() => setNotice(null), []);

  const run = useCallback(
    async <T,>(key: string, work: () => Promise<T>, successMessage?: string | ((result: T) => string)) => {
      setPending(key);
      setNotice(null);
      if (timer.current) clearTimeout(timer.current);
      try {
        const result = await work();
        const message =
          typeof successMessage === "function" ? successMessage(result) : successMessage;
        if (message) {
          setNotice({ tone: "success", message });
          timer.current = setTimeout(() => setNotice(null), 8_000);
        }
        return { ok: true as const, result };
      } catch (cause) {
        setNotice({ tone: "error", message: friendlyError(cause) });
        return { ok: false as const, error: friendlyError(cause) };
      } finally {
        setPending(null);
      }
    },
    [],
  );

  return { pending, notice, run, clearNotice, setNotice };
}
