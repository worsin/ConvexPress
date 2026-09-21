import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

test("deployed compatibility metadata initializes no Zod schemas until migration and caches them afterward", () => {
	const root = fileURLToPath(new URL("../../", import.meta.url));
	const result = spawnSync(
		"node",
		[
			"--experimental-vm-modules",
			"--input-type=module",
			"-e",
			`
    import fs from 'node:fs'; import vm from 'node:vm'; import {createRequire} from 'node:module';
    const root=${JSON.stringify(root)},require=createRequire(root+'ConvexPress-Admin/package.json');
    const actual=require('zod');let accesses=0;
    const z=new Proxy(actual.z,{get(target,key){accesses++;return Reflect.get(target,key);}});
    const dep=new vm.SyntheticModule(['z'],function(){this.setExport('z',z);});
    const mod=new vm.SourceTextModule(fs.readFileSync(root+'ConvexPress-Admin/packages/backend/canonical-blocks-foundation/compatibility/legacy_schemas.mjs','utf8'));
    await mod.link(()=>dep);await mod.evaluate();
    const metadata=Object.values(mod.namespace.legacyCompatibility).map(row=>[row.name,row.fromVersion,row.toVersion]);
    const before=accesses,first=mod.namespace.legacyCompatibility['core/heading'].savedSchema;
    const initialized=accesses,second=mod.namespace.legacyCompatibility['core/heading'].savedSchema;
    console.log(JSON.stringify({before,initialized,after:accesses,cached:first===second,count:metadata.length}));
  `,
		],
		{ cwd: root, encoding: "utf8" },
	);
	expect(result.status, result.stderr).toBe(0);
	const receipt = JSON.parse(result.stdout);
	expect(receipt.before).toBe(0);
	expect(receipt.initialized).toBeGreaterThan(0);
	// One heading must not initialize unrelated core or plugin validators.
	expect(receipt.initialized).toBeLessThan(40);
	expect(receipt.after).toBe(receipt.initialized);
	expect(receipt.cached).toBe(true);
	expect(receipt.count).toBe(54);
});
