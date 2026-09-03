export const MIN_RESERVATION_TTL_MS = 60_000;
export const MAX_RESERVATION_TTL_MS = 60 * 60_000;

const RESERVATION_ID_PATTERN = /^[A-Za-z0-9_-]{16,160}$/;
const MACHINE_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

export type BootstrapReservationStatus =
  | "reserved"
  | "owner_created"
  | "machine_enrolled"
  | "finalized"
  | "failed";

export interface BootstrapReservation {
  reservationId: string;
  machineId: string;
  ownerEmail: string;
  status: BootstrapReservationStatus;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
}

export interface CleanBootstrapInput {
  reservationId: string;
  machineId: string;
  ownerEmail: string;
  ttlMs: number;
}

export type ReservationWriteDecision =
  | { kind: "create"; expiresAt: number }
  | { kind: "replace"; expiresAt: number }
  | { kind: "renew"; expiresAt: number }
  | { kind: "finalized"; expiresAt: number };

export function cleanReservationId(value: string): string {
  const reservationId = value.trim();
  if (!RESERVATION_ID_PATTERN.test(reservationId)) {
    throw new Error("Invalid server bootstrap reservation identity");
  }
  return reservationId;
}

export function cleanMachineId(value: string): string {
  const machineId = value.trim();
  if (!MACHINE_ID_PATTERN.test(machineId)) {
    throw new Error("Invalid machine identity");
  }
  return machineId;
}

export function cleanOwnerEmail(value: string): string {
  const ownerEmail = value.trim().toLowerCase();
  if (
    ownerEmail.length < 3 ||
    ownerEmail.length > 320 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(ownerEmail)
  ) {
    throw new Error("Invalid bootstrap owner email");
  }
  return ownerEmail;
}

export function cleanReservationTtl(value: number): number {
  if (
    !Number.isSafeInteger(value) ||
    value < MIN_RESERVATION_TTL_MS ||
    value > MAX_RESERVATION_TTL_MS
  ) {
    throw new Error(
      `Bootstrap reservation TTL must be an integer from ${MIN_RESERVATION_TTL_MS} to ${MAX_RESERVATION_TTL_MS}`,
    );
  }
  return value;
}

export function cleanBootstrapInput(input: {
  reservationId: string;
  machineId: string;
  ownerEmail: string;
  ttlMs: number;
}): CleanBootstrapInput {
  return {
    reservationId: cleanReservationId(input.reservationId),
    machineId: cleanMachineId(input.machineId),
    ownerEmail: cleanOwnerEmail(input.ownerEmail),
    ttlMs: cleanReservationTtl(input.ttlMs),
  };
}

export function decideReservationWrite(input: {
  now: number;
  input: CleanBootstrapInput;
  existing?: BootstrapReservation;
}): ReservationWriteDecision {
  const expiresAt = input.now + input.input.ttlMs;
  const existing = input.existing;
  if (!existing) return { kind: "create", expiresAt };

  if (existing.reservationId === input.input.reservationId) {
    if (
      existing.machineId !== input.input.machineId ||
      existing.ownerEmail !== input.input.ownerEmail
    ) {
      throw new Error("A reservation retry must keep the same machine and owner");
    }
    if (existing.status === "failed") {
      throw new Error("A failed bootstrap reservation cannot be reopened");
    }
    if (existing.status === "finalized") {
      return { kind: "finalized", expiresAt: existing.expiresAt };
    }
    return { kind: "renew", expiresAt };
  }

  if (
    existing.status === "owner_created" ||
    existing.status === "machine_enrolled"
  ) {
    throw new Error("Resume the reservation that created the installation owner");
  }
  if (existing.status === "finalized") {
    throw new Error("This deployment is already finalized");
  }
  if (existing.status !== "failed" && existing.expiresAt > input.now) {
    throw new Error("Another server bootstrap reservation is active");
  }

  return { kind: "replace", expiresAt };
}
