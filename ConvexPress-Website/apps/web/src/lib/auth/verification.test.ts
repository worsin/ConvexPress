import { describe, expect, test } from "bun:test";

import {
  clearPendingSubscriptionIntent,
  clearPendingVerificationContext,
  getPendingVerificationCouponCodeForOffer,
  PENDING_EMAIL_VERIFICATION_STORAGE_KEY,
  PENDING_SUBSCRIPTION_INTENT_STORAGE_KEY,
  readPendingVerificationContext,
  writePendingVerificationContext,
} from "./verification";

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }
}

describe("pending verification helpers", () => {
  test("round-trips verification context through storage", () => {
    const storage = new MemoryStorage();

    writePendingVerificationContext(
      {
        email: "member@example.com",
        returnTo: "/signup/offer_123",
        source: "subscription",
        offerId: "offer_123",
        couponCode: "SPRING50",
      },
      storage,
    );

    expect(readPendingVerificationContext(storage)).toEqual({
      email: "member@example.com",
      returnTo: "/signup/offer_123",
      source: "subscription",
      offerId: "offer_123",
      couponCode: "SPRING50",
    });
  });

  test("ignores malformed stored payloads", () => {
    const storage = new MemoryStorage();
    storage.setItem(PENDING_EMAIL_VERIFICATION_STORAGE_KEY, "{not-json");

    expect(readPendingVerificationContext(storage)).toBeNull();
  });

  test("clears verification and pending subscription intent state", () => {
    const storage = new MemoryStorage();
    storage.setItem(PENDING_EMAIL_VERIFICATION_STORAGE_KEY, '{"email":"a@b.com"}');
    storage.setItem(PENDING_SUBSCRIPTION_INTENT_STORAGE_KEY, "intent_123");

    clearPendingVerificationContext(storage);
    clearPendingSubscriptionIntent(storage);

    expect(storage.getItem(PENDING_EMAIL_VERIFICATION_STORAGE_KEY)).toBeNull();
    expect(storage.getItem(PENDING_SUBSCRIPTION_INTENT_STORAGE_KEY)).toBeNull();
  });

  test("only restores coupon codes for the matching pending offer", () => {
    const storage = new MemoryStorage();

    writePendingVerificationContext(
      {
        source: "subscription",
        offerId: "offer_abc",
        couponCode: "SAVE20",
      },
      storage,
    );

    expect(
      getPendingVerificationCouponCodeForOffer("offer_abc", storage),
    ).toBe("SAVE20");
    expect(
      getPendingVerificationCouponCodeForOffer("offer_xyz", storage),
    ).toBe(undefined);
  });
});
