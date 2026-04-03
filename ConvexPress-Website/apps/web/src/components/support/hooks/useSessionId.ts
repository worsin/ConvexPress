/**
 * Session ID hook for anonymous widget tracking.
 *
 * Generates a random UUID and persists it in localStorage.
 * The session ID ties anonymous widget interactions across
 * multiple queries within the same browser session.
 *
 * The ID persists until the user clears localStorage or the
 * 24-hour expiry is reached. On expiry, a new ID is generated.
 */

import { useState, useEffect } from "react";

const STORAGE_KEY = "convexpress_support_session";
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface StoredSession {
  id: string;
  createdAt: number;
}

function generateSessionId(): string {
  // Use crypto.randomUUID when available, fallback to manual generation
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for older browsers
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
    /[xy]/g,
    (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    },
  );
}

function getOrCreateSession(): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed: StoredSession = JSON.parse(stored);
      const age = Date.now() - parsed.createdAt;
      if (age < SESSION_TTL_MS) {
        return parsed.id;
      }
    }
  } catch {
    // localStorage unavailable or corrupted -- generate new
  }

  const newSession: StoredSession = {
    id: generateSessionId(),
    createdAt: Date.now(),
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newSession));
  } catch {
    // localStorage full or unavailable -- use ephemeral
  }

  return newSession.id;
}

export function useSessionId(): string {
  const [sessionId] = useState(() => {
    // During SSR, return a placeholder; will be replaced on client
    if (typeof window === "undefined") {
      return "ssr-placeholder";
    }
    return getOrCreateSession();
  });

  // Re-read on client mount (handles SSR hydration)
  const [clientId, setClientId] = useState(sessionId);

  useEffect(() => {
    setClientId(getOrCreateSession());
  }, []);

  return clientId;
}
