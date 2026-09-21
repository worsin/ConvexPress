import {createContext,useContext} from "react";
// Host-only resource substitution for isolated demonstrations; production uses the approved URL unchanged.
export const SocialMediaContext=createContext<Readonly<Record<string,string>>>({});
export const useSocialMedia=()=>useContext(SocialMediaContext);
