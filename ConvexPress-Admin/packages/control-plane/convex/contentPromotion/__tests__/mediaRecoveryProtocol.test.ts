import { test, expect } from "bun:test";
import {
	recoveryDisposition,
	recoveryEvidenceHash,
} from "../mediaRecoveryProtocol";
const base = {
	transferKey: "a".repeat(64),
	targetIntentId: "intent",
	storageId: "stored",
	phase: "uploaded" as const,
	dispatchCount: 1,
	leaseExpiresAt: 0,
};
test("recovery accepts only recorded or target-verified bytes after a lease ends", () => {
	expect(recoveryDisposition(base, null, 100)).toBe("known-storage");
	expect(
		recoveryDisposition(
			{ ...base, storageId: null },
			{ intentId: "intent", storageId: "stored", status: "verified" },
			100,
		),
	).toBe("verified");
	expect(recoveryDisposition({ ...base, storageId: null }, null, 100)).toBe(
		"unresolved",
	);
	expect(
		recoveryDisposition(
			{ ...base, phase: "planned", dispatchCount: 0, storageId: null },
			null,
			100,
		),
	).toBe("unresolved");
	expect(recoveryDisposition({ ...base, leaseExpiresAt: 101 }, null, 100)).toBe(
		"busy",
	);
});
test("recovery rejects different target intent and storage binding", () => {
	expect(() =>
		recoveryDisposition(
			base,
			{ intentId: "other", storageId: "stored", status: "verified" },
			100,
		),
	).toThrow();
	expect(() =>
		recoveryDisposition(
			base,
			{ intentId: "intent", storageId: "other", status: "verified" },
			100,
		),
	).toThrow();
});
test("evidence fingerprint binds immutable identity and recorded state, not lease expiry", () => {
	expect(recoveryEvidenceHash(base)).toBe(
		recoveryEvidenceHash({ ...base, leaseExpiresAt: 900 }),
	);
	expect(recoveryEvidenceHash(base)).not.toBe(
		recoveryEvidenceHash({ ...base, storageId: "other" }),
	);
	expect(recoveryEvidenceHash(base)).not.toBe(
		recoveryEvidenceHash({ ...base, dispatchCount: 0 }),
	);
});
