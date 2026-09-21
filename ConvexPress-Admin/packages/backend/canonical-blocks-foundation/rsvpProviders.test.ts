import { expect, test } from "bun:test";
import { rsvpSnapshotSchema } from "./rsvpContracts";
const snapshot = {
 postId:"post",blockId:"rsvp",eventId:"event",definitionVersion:"a".repeat(64),title:"Gathering",href:"/events/gathering",startsAt:3000,endsAt:4000,timeZone:"UTC",venue:"Studio",state:"open",closesAt:3000,remaining:2,responsePolicy:"guests",registration:null,canCancel:false,asOf:1000,nextChangeAt:3000,
 security:{honeypotEnabled:true,honeypotFieldName:"website",captchaEnabled:false,captchaProvider:"none",captchaSiteKey:null,recaptchaMinScore:.5},
};
test("RSVP snapshots bind their route to an explicit provider while retaining existing Events snapshots",()=>{
 expect(rsvpSnapshotSchema.parse(snapshot)).toEqual(snapshot);
 const generated={...snapshot,providerId:"community-events",href:"/community-events/gathering"};
 expect(rsvpSnapshotSchema.parse(generated)).toEqual(generated);
 for(const patch of [{providerId:"community-events"},{href:"/community-events/gathering"},{providerId:"../auth"},{providerId:"events/get"},{providerId:"events",href:"/events/../admin"},{providerId:"events",href:"/events/other/path"}]) expect(()=>rsvpSnapshotSchema.parse({...snapshot,...patch})).toThrow();
});
