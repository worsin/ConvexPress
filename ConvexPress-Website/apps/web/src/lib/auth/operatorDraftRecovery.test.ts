import { expect, test } from "bun:test";
import { createOperatorDraftRecovery, type CustomizerRecovery } from "./operatorDraftRecovery";
import { applyDraftChange, createDraftHistory, undoDraft } from "../../templates/sdk/draftModel";

const base = { values: { colors: { primary: "#112233" } }, variants: {} };
const edited = { values: { colors: { primary: "#445566" } }, variants: {} };
const draft: CustomizerRecovery = { packId: "journal", base, revision: "published-before", history: applyDraftChange(createDraftHistory(base), edited), draftRevision: "private-before" };

test("expiry retains authored values, history and conflict revisions but revokes old callbacks", () => {
  const store = createOperatorDraftRecovery();
  const session = {};
  store.activate(session);
  const old = store.access(session);
  old.write("staging:alice", draft);
  store.activate(null);
  expect(old.read("staging:alice")).toBeNull();
  old.write("staging:alice", null);
  expect(store.hasDraft()).toBe(true);
  const renewed = {};
  store.activate(renewed);
  const current = store.access(renewed);
  const recovered = current.read("staging:alice")!;
  expect(recovered).toEqual(draft);
  expect(undoDraft(recovered.history).present).toEqual(base);
  old.write("staging:alice", { ...draft, revision: "stale-response" });
  expect(current.read("staging:alice")?.revision).toBe("published-before");
  recovered.history.present.values.colors.primary = "mutated-copy";
  expect(current.read("staging:alice")?.history.present).toEqual(edited);
});

test("another account or environment cannot recover or retain the previous draft", () => {
  for (const owner of ["staging:bob", "live:alice"]) {
    const store = createOperatorDraftRecovery();
    const session = {}; store.activate(session);
    const access = store.access(session);
    access.write("staging:alice", draft);
    expect(access.read(owner)).toBeNull();
    expect(store.hasDraft()).toBe(false);
    expect(access.read("staging:alice")).toBeNull();
  }
});

test("explicit discard clears recovery and reactivated session objects do not revive old callbacks", () => {
  const store = createOperatorDraftRecovery();
  const session = {}; store.activate(session);
  const old = store.access(session);
  old.write("staging:alice", draft);
  store.activate(null); store.clear(); store.activate(session);
  old.write("staging:alice", draft);
  expect(store.hasDraft()).toBe(false);
  const current = store.access(session);
  current.write("staging:alice", draft);
  current.write("staging:alice", null);
  expect(store.hasDraft()).toBe(false);
});
