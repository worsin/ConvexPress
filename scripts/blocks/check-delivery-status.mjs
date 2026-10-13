import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {TRACKER} from './tracker.mjs';
/* Offline parity gate: the delivery status file must match, row for row, an
 * exact full readback of the MagicTables block tracker. The readback is a
 * tracked file (CHECKPOINT_DIR), so a fresh checkout can run this without
 * MagicTables access or anyone's private output/ folder. Capture a new one with
 *   mt table records <TRACKER.tableId> --fields "Name,Status,Spec Path" --sort Name:asc --limit 500 --format json
 * into CHECKPOINT_DIR/<date>-blocks.json, then point checkpointSource at it. */
const CHECKPOINT_DIR='docs/superpowers/plans/tracker-checkpoints/';
const root=fileURLToPath(new URL('../../',import.meta.url));
const status=JSON.parse(await fs.readFile(path.join(root,'docs/superpowers/plans/2026-09-28-editor-template-status.json'),'utf8'));
assert(typeof status.checkpointSource==='string'&&status.checkpointSource.startsWith(CHECKPOINT_DIR)&&path.posix.normalize(status.checkpointSource)===status.checkpointSource&&status.checkpointSource.endsWith('.json'),`checkpointSource must be a tracked readback under ${CHECKPOINT_DIR}`);
const snapshot=JSON.parse(await fs.readFile(path.join(root,status.checkpointSource),'utf8'));
assert.deepEqual([snapshot.context?.base?.id,snapshot.context?.table?.id],[TRACKER.baseId,TRACKER.tableId],'Checkpoint is not a readback of the block tracker table');
const rows=snapshot.records;
assert(Array.isArray(rows),'Checkpoint source must contain tracker records');
assert(snapshot.summary?.offset===0&&snapshot.summary.matched===rows.length&&snapshot.summary.returned===rows.length,'Checkpoint must be one complete, untruncated tracker readback');
const tracker=new Map(rows.map(row=>[row.values.Name,row.values.Status]));
const local=new Map(status.blocks.map(block=>[block.name,block.checkpointStatus]));
assert.equal(tracker.size,rows.length,'Duplicate tracker names');
assert.equal(local.size,status.blocks.length,'Duplicate status names');
assert.equal(tracker.size,137,'Expected complete 137-block tracker readback');
assert.deepEqual([...local.keys()].sort(),[...tracker.keys()].sort(),'Status and tracker identities differ');
const stale=[...local].filter(([name,value])=>tracker.get(name)!==value).map(([name,local])=>({name,local,tracker:tracker.get(name)}));
assert.deepEqual(stale,[],'Per-block status differs from the exact tracker checkpoint');
const counts={};for(const value of tracker.values()){assert(['Verified','In progress'].includes(value),'Unexpected tracker status');counts[value]=(counts[value]??0)+1;}
assert.deepEqual(status.checkpointCounts,counts,'Checkpoint header differs from tracker and rows');
console.log(JSON.stringify({rows:tracker.size,counts,perRowParity:true,headerParity:true,source:status.checkpointSource}));
