export type RsvpSettings={mode:"closed"|"guests"|"signedIn";capacity:number|null;closesAt:number|null};
export type RsvpDraft={rsvpMode:RsvpSettings["mode"];rsvpCapacity:string;rsvpCloses:string};
export const localEventDate=(value:number)=>{const date=new Date(value);return new Date(value-date.getTimezoneOffset()*60000).toISOString().slice(0,16);};
export function rsvpDraft(settings?:RsvpSettings):RsvpDraft{return {rsvpMode:settings?.mode??"closed",rsvpCapacity:settings?.capacity?.toString()??"",rsvpCloses:settings?.closesAt==null?"":localEventDate(settings.closesAt)};}
export function rsvpSettings(draft:RsvpDraft,startsAt:number,registrationUrl:string):RsvpSettings{
 const capacity=draft.rsvpCapacity.trim()===""?null:Number(draft.rsvpCapacity);
 if(capacity!==null&&(!Number.isSafeInteger(capacity)||capacity<1||capacity>1000000))throw new Error("Enter a whole-number capacity between 1 and 1,000,000, or leave it blank for no limit.");
 const closesAt=draft.rsvpCloses===""?null:new Date(draft.rsvpCloses).getTime();
 if(closesAt!==null&&(!Number.isSafeInteger(closesAt)||closesAt<0||closesAt>startsAt))throw new Error("Registration must close at or before the event starts.");
 if(draft.rsvpMode!=="closed"&&registrationUrl.trim())throw new Error("Remove the external registration link before enabling website RSVPs.");
 return {mode:draft.rsvpMode,capacity,closesAt};
}
