import { expect, test } from "bun:test";
import { commerceHarness } from "../../commerce/__tests__/handlerHarness.test-support";
import { RequestReadLedger } from "../../helpers/requestReadLedger";
import { PLUGIN_SETTINGS_KEY } from "../../plugins/registry";
import { consumerIndexGeneration } from "../../syncedBlocks/consumerIndexState";
import { MEDIA_INDEX_EPOCH_NAME } from "@convexpress/site-contract/media-index-epoch";
import { dependencyDescriptors } from "../foundation/generated/metadata";
import { resolverArgs } from "../foundation/contracts";
import { displayContext } from "../displayContext";

const referenceBlocks = () => Object.entries(dependencyDescriptors)
  .filter(([, descriptor]) => descriptor.fields.some(field => field.type === "reference"));

function assertReferenceCoverage(disabled: readonly string[]) {
  const missing = referenceBlocks().filter(([name]) => disabled.includes(name));
  if (missing.length) throw Error("Uncovered canonical references: " + missing.map(([name, descriptor]) =>
    `${name}: ${descriptor.fields.filter(field => field.type === "reference").map(field => field.path.join(".")).join(", ")}`).join("; "));
}

test("every generated reference is enabled with installed plugins and a ready structural index", async () => {
  const previousEpoch = process.env[MEDIA_INDEX_EPOCH_NAME];
  process.env[MEDIA_INDEX_EPOCH_NAME] = "reference-coverage-fixture-epoch";
  try {
    const scope = { websiteKey: "reference-fixture", instanceKey: "reference-stage", deploymentOrigin: "https://reference.invalid" };
    const ctx = commerceHarness({
      convexpress_siteIdentity: [{ _id: "identity", identityKey: "site-identity", ...scope }],
      settings: [
        { _id: "plugins", section: "plugins", values: Object.fromEntries(Object.values(PLUGIN_SETTINGS_KEY).map(key => [key, true])) },
        { _id: "appearance", section: "appearance.template", values: { active: "core", overrides: {}, variants: {}, settings: {} }, legacyAppearanceMigration: { version: 2, migratedAt: 1 } },
      ],
      syncedBlockConsumerIndex: [{ _id: "index", key: "active", ...scope, generation: consumerIndexGeneration(), phase: "ready", cursor: null, sequence: 0, documents: 0 }],
    });
    const read = () => displayContext(ctx, new RequestReadLedger());
    const snapshot = JSON.stringify(ctx.tables);
    const enabled = await read();
    expect(new Set(enabled.policy.enabledPlugins)).toEqual(new Set(Object.keys(PLUGIN_SETTINGS_KEY)));
    expect(referenceBlocks().length).toBeGreaterThan(0);
    assertReferenceCoverage(enabled.policy.disabledBlocks);
    expect(JSON.stringify(ctx.tables)).toBe(snapshot);

    // A real field-policy rejection must fail the gate, not just a synthetic
    // list comparison. Change metadata only inside this isolated test process.
    const descriptor = dependencyDescriptors["core/author-bio"];
    const field = descriptor.fields.find(field => field.type === "reference")!;
    const mutable = field as unknown as { of: string };
    const originalKind = mutable.of;
    try {
      mutable.of = "unregistered-fixture-reference";
      const unsupported = await read();
      expect(unsupported.policy.disabledBlocks).toContain("core/author-bio");
      expect(() => assertReferenceCoverage(unsupported.policy.disabledBlocks)).toThrow("core/author-bio: userId");
    } finally { mutable.of = originalKind; }

    // Synced content expands before ordinary resolver planning. Its explicit
    // runtime readiness gate must not become a permanent coverage exemption.
    expect(Object.hasOwn(resolverArgs, "content.syncedBlock")).toBe(false);
    ctx.tables.syncedBlockConsumerIndex[0].phase = "posts";
    expect((await read()).policy.disabledBlocks).toContain("core/synced");
    ctx.tables.syncedBlockConsumerIndex[0].phase = "ready";
    expect((await read()).policy.disabledBlocks).not.toContain("core/synced");

    const plugins = ctx.tables.settings.find((row: { section: string }) => row.section === "plugins");
    plugins.values[PLUGIN_SETTINGS_KEY.events] = false;
    expect((await read()).policy.disabledBlocks).toContain("events/next-event");
    plugins.values[PLUGIN_SETTINGS_KEY.events] = true;
    assertReferenceCoverage((await read()).policy.disabledBlocks);
    expect(JSON.stringify(ctx.tables)).toBe(snapshot);
    console.log(`Reference coverage: ${referenceBlocks().length} blocks, ${referenceBlocks().reduce((count, [, descriptor]) => count + descriptor.fields.filter(field => field.type === "reference").length, 0)} fields; all installed plugins enabled.`);
  } finally {
    if (previousEpoch === undefined) delete process.env[MEDIA_INDEX_EPOCH_NAME];
    else process.env[MEDIA_INDEX_EPOCH_NAME] = previousEpoch;
  }
});
