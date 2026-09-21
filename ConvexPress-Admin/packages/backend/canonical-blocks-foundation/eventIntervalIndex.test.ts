import {test,expect} from 'bun:test';
import {eventIntervalBucket,eventCarryoverRanges} from './eventIntervalIndex';
function matches(start:number,end:number,point:number){const bucket=eventIntervalBucket(start,end);return eventCarryoverRanges(point).filter(range=>range.bucket===bucket&&(range.bound==='startsBefore'?start<point:end>point)).length;}
test('derived interval buckets find strict carryovers once at exact and power-of-two boundaries',()=>{
 for(const [start,end] of [[0,1],[0,2],[1,3],[7,9],[8,16],[9,15],[15,17],[0,8_640_000_000_000_000],[8_639_999_999_999_999,8_640_000_000_000_000]]){
  for(const point of [0,start,Math.floor(start+(end-start)/2),end-1,end])expect(matches(start!,end!,point!)).toBe(start!<point!&&end!>point!?1:0);
 }
 expect(eventCarryoverRanges(-1)).toEqual([]);expect(eventCarryoverRanges(1)).toHaveLength(53);
});
test('bounded ranges never return unrelated historical or future intervals',()=>{
 let state=0x31ab;const random=()=>{state=(state*1664525+1013904223)>>>0;return state/2**32;};
 for(let n=0;n<4000;n++){
  const start=Math.floor(random()*8e15),end=start+1+Math.floor(random()*(8.64e15-start-1));
  const point=Math.floor(random()*8.64e15);
  expect(matches(start,end,point)).toBe(start<point&&end>point?1:0);
 }
});
test('interval keys reject malformed times without 32-bit truncation',()=>{
 expect(eventIntervalBucket(2**40-1,2**40+1)).toBe('41:0');
 for(const [start,end] of [[-1,1],[2,1],[1,1],[1.5,3],[0,Infinity],[0,8_640_000_000_000_001]])expect(()=>eventIntervalBucket(start!,end!)).toThrow();
 expect(()=>eventCarryoverRanges(NaN)).toThrow();
});
