export const PENDING_EMAIL_VERIFICATION_STORAGE_KEY =
  "pending_email_verification";

export const PENDING_SUBSCRIPTION_INTENT_STORAGE_KEY =
  "pending_subscription_intent_id";

export type PendingVerificationSource = "register" | "subscription";

export interface PendingVerificationContext {
  email?: string;
  returnTo?: string;
  source?: PendingVerificationSource;
  offerId?: string;
  couponCode?: string;
}

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function getStorage(storage?: StorageLike): StorageLike | null {
  if (storage) return storage;
  if (typeof window === "undefined") return null;

  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function normalizeContext(
  context: PendingVerificationContext,
): PendingVerificationContext {
  const normalized = Object.fromEntries(
    Object.entries(context).filter(
      ([, value]) => typeof value === "string" && value.trim().length > 0,
    ),
  ) as PendingVerificationContext;

  return normalized;
}

export function readPendingVerificationContext(
  storage?: StorageLike,
): PendingVerificationContext | null {
  const target = getStorage(storage);
  if (!target) return null;

  const raw = target.getItem(PENDING_EMAIL_VERIFICATION_STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return normalizeContext(parsed as PendingVerificationContext);
  } catch {
    return null;
  }
}

export function writePendingVerificationContext(
  context: PendingVerificationContext,
  storage?: StorageLike,
) {
  const target = getStorage(storage);
  if (!target) return;

  const normalized = normalizeContext(context);
  if (Object.keys(normalized).length === 0) {
    target.removeItem(PENDING_EMAIL_VERIFICATION_STORAGE_KEY);
    return;
  }

  target.setItem(
    PENDING_EMAIL_VERIFICATION_STORAGE_KEY,
    JSON.stringify(normalized),
  );
}

export function clearPendingVerificationContext(storage?: StorageLike) {
  const target = getStorage(storage);
  target?.removeItem(PENDING_EMAIL_VERIFICATION_STORAGE_KEY);
}

export function clearPendingSubscriptionIntent(storage?: StorageLike) {
  const target = getStorage(storage);
  target?.removeItem(PENDING_SUBSCRIPTION_INTENT_STORAGE_KEY);
}

export function getPendingVerificationCouponCodeForOffer(
  offerId: string,
  storage?: StorageLike,
): string | undefined {
  const context = readPendingVerificationContext(storage);
  if (
    context?.source === "subscription" &&
    context.offerId === offerId &&
    context.couponCode
  ) {
    return context.couponCode;
  }

  return undefined;
}
