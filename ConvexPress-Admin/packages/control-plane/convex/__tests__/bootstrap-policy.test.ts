import { describe, expect, test } from "bun:test";

import {
  cleanBootstrapInput,
  decideReservationWrite,
  type BootstrapReservation,
} from "../serverBootstrapPolicy";

const NOW = Date.parse("2026-09-02T18:00:00.000Z");

function reservation(
  overrides: Partial<BootstrapReservation> = {},
): BootstrapReservation {
  return {
    reservationId: "reservation_0123456789",
    machineId: "machine_01234567",
    ownerEmail: "owner@example.com",
    status: "reserved",
    createdAt: NOW,
    updatedAt: NOW,
    expiresAt: NOW + 120_000,
    ...overrides,
  };
}

describe("standalone server bootstrap policy", () => {
  test("normalizes and bounds all reservation input", () => {
    expect(
      cleanBootstrapInput({
        reservationId: " reservation_0123456789 ",
        machineId: " machine_01234567 ",
        ownerEmail: " OWNER@Example.com ",
        ttlMs: 120_000,
      }),
    ).toEqual({
      reservationId: "reservation_0123456789",
      machineId: "machine_01234567",
      ownerEmail: "owner@example.com",
      ttlMs: 120_000,
    });

    expect(() =>
      cleanBootstrapInput({
        reservationId: "short",
        machineId: "machine_01234567",
        ownerEmail: "owner@example.com",
        ttlMs: 120_000,
      }),
    ).toThrow("reservation identity");
    expect(() =>
      cleanBootstrapInput({
        reservationId: "reservation_0123456789",
        machineId: "short",
        ownerEmail: "owner@example.com",
        ttlMs: 120_000,
      }),
    ).toThrow("machine identity");
    expect(() =>
      cleanBootstrapInput({
        reservationId: "reservation_0123456789",
        machineId: "machine_01234567",
        ownerEmail: "not-an-email",
        ttlMs: 120_000,
      }),
    ).toThrow("owner email");
    expect(() =>
      cleanBootstrapInput({
        reservationId: "reservation_0123456789",
        machineId: "machine_01234567",
        ownerEmail: "owner@example.com",
        ttlMs: 1,
      }),
    ).toThrow("TTL");
  });

  test("creates a first reservation and only renews an exact retry", () => {
    expect(
      decideReservationWrite({
        now: NOW,
        input: cleanBootstrapInput({
          reservationId: "reservation_0123456789",
          machineId: "machine_01234567",
          ownerEmail: "owner@example.com",
          ttlMs: 120_000,
        }),
      }),
    ).toEqual({ kind: "create", expiresAt: NOW + 120_000 });

    expect(
      decideReservationWrite({
        now: NOW + 1_000,
        existing: reservation(),
        input: cleanBootstrapInput({
          reservationId: "reservation_0123456789",
          machineId: "machine_01234567",
          ownerEmail: "OWNER@example.com",
          ttlMs: 120_000,
        }),
      }),
    ).toEqual({ kind: "renew", expiresAt: NOW + 121_000 });

    expect(() =>
      decideReservationWrite({
        now: NOW,
        existing: reservation(),
        input: cleanBootstrapInput({
          reservationId: "reservation_0123456789",
          machineId: "other_machine_01234567",
          ownerEmail: "owner@example.com",
          ttlMs: 120_000,
        }),
      }),
    ).toThrow("same machine and owner");
  });

  test("blocks competing active, used, and finalized reservations", () => {
    const input = cleanBootstrapInput({
      reservationId: "different_0123456789",
      machineId: "machine_01234567",
      ownerEmail: "owner@example.com",
      ttlMs: 120_000,
    });

    expect(() =>
      decideReservationWrite({ now: NOW, existing: reservation(), input }),
    ).toThrow("active");
    expect(() =>
      decideReservationWrite({
        now: NOW,
        existing: reservation({ status: "owner_created" }),
        input,
      }),
    ).toThrow("created");
    expect(() =>
      decideReservationWrite({
        now: NOW,
        existing: reservation({ status: "finalized" }),
        input,
      }),
    ).toThrow("finalized");
  });
});
