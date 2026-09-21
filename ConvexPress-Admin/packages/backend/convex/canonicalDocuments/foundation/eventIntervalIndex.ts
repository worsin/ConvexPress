/** One derived key per event supports a point-in-interval lookup without
 * scanning the history or materializing one row per event day/month.
 *
 * Store an event at the smallest power-of-two time interval containing all
 * its integer milliseconds [startsAt, endsAt). For level > 0 it crosses that
 * interval's midpoint. When querying a point in its lower half, startsAt < p
 * alone proves endsAt > p; in its upper half, endsAt > p proves startsAt < p.
 * Thus each of at most 53 bucket/index ranges returns only actual carryovers.
 * The source record and both bounds still need validation on every read.
 */
const MAX_TIME=8_640_000_000_000_000;
export function eventIntervalBucket(startsAt:number,endsAt:number):string{
 if(!Number.isSafeInteger(startsAt)||!Number.isSafeInteger(endsAt)||startsAt<0||endsAt<=startsAt||endsAt>MAX_TIME)throw Error('Invalid event interval');
 let level=0,width=1;
 while(Math.floor(startsAt/width)!==Math.floor((endsAt-1)/width)){level++;width*=2;}
 return `${level}:${Math.floor(startsAt/width)}`;
}
export type EventCarryoverRange={bucket:string;bound:'startsBefore'|'endsAfter';point:number};
export function eventCarryoverRanges(point:number):EventCarryoverRange[]{
 if(!Number.isSafeInteger(point)||Math.abs(point)>MAX_TIME)throw Error('Invalid calendar boundary');
 if(point<=0)return [];
 // Level zero contains one millisecond and cannot strictly straddle an integer point.
 return Array.from({length:53},(_,index)=>{
  const level=index+1,width=2**level,bucket=Math.floor(point/width),midpoint=bucket*width+width/2;
  return {bucket:`${level}:${bucket}`,bound:point<midpoint?'startsBefore':'endsAfter',point};
 });
}
