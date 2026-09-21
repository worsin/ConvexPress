import {test,expect} from "bun:test";
import {rsvpDraft,rsvpSettings} from "./rsvp-settings";
test("legacy events default to disabled RSVP and optional limits stay absent",()=>{
 expect(rsvpDraft()).toEqual({rsvpMode:"closed",rsvpCapacity:"",rsvpCloses:""});
 expect(rsvpSettings({...rsvpDraft(),rsvpMode:"guests"},Date.now()+86400000,"")).toEqual({mode:"guests",capacity:null,closesAt:null});
});
test("organizer capacity cannot be fractional, negative or silently converted to zero",()=>{
 for(const capacity of ["0","-1","1.5","1000001","NaN"])expect(()=>rsvpSettings({...rsvpDraft(),rsvpCapacity:capacity},Date.now()+86400000,"")).toThrow();
 expect(rsvpSettings({...rsvpDraft(),rsvpCapacity:"24"},Date.now()+86400000,"").capacity).toBe(24);
});
test("RSVP deadlines round-trip through the local editor and cannot follow the event",()=>{
 const closesAt=Math.floor((Date.now()+3600000)/60000)*60000,settings={mode:"signedIn" as const,capacity:8,closesAt};
 expect(rsvpSettings(rsvpDraft(settings),closesAt+3600000,"")).toEqual(settings);
 expect(()=>rsvpSettings(rsvpDraft(settings),closesAt-1,"")).toThrow("close at or before");
 expect(()=>rsvpSettings({...rsvpDraft(),rsvpCloses:"invalid"},closesAt,"")).toThrow();
});
test("an external registration link and native RSVP cannot both be enabled",()=>{
 expect(()=>rsvpSettings({...rsvpDraft(),rsvpMode:"guests"},Date.now(),"https://tickets.example.invalid")).toThrow("external registration link");
 expect(rsvpSettings(rsvpDraft(),Date.now(),"https://tickets.example.invalid").mode).toBe("closed");
});
