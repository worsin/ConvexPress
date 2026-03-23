import { useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";

interface UseAuthRedirectResult {
  returnTo: string | null;
  redirectAfterAuth: () => void;
}

/**
 * Parses and validates the returnTo URL from search params.
 * Prevents open redirect attacks by only allowing relative paths.
 */
function validateReturnTo(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;

  const trimmed = value.trim();

  // Block empty
  if (!trimmed) return null;

  // Block javascript: and data: URIs
  if (/^(javascript|data|vbscript):/i.test(trimmed)) return null;

  // Block protocol-relative URLs (//evil.com)
  if (trimmed.startsWith("//")) return null;

  // Block absolute URLs with a scheme
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return null;

  // Must start with / to be a relative path
  if (!trimmed.startsWith("/")) return null;

  // Block URLs with encoded characters that could bypass checks
  try {
    const decoded = decodeURIComponent(trimmed);
    if (/^(javascript|data|vbscript):/i.test(decoded)) return null;
    if (decoded.startsWith("//")) return null;
  } catch {
    // Invalid encoding -- reject
    return null;
  }

  return trimmed;
}

export function useAuthRedirect(): UseAuthRedirectResult {
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const navigate = useNavigate();

  const returnTo = useMemo(
    () => validateReturnTo(search?.returnTo),
    [search?.returnTo],
  );

  const redirectAfterAuth = useCallback(() => {
    if (returnTo) {
      navigate({ to: returnTo });
    } else {
      navigate({ to: "/" });
    }
  }, [returnTo, navigate]);

  return { returnTo, redirectAfterAuth };
}
