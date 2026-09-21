import type {Id} from "../_generated/dataModel";
import type {LeadMagnetRequest} from "../canonicalDocuments/foundation/leadMagnetContracts";
export type SubmitRequest=LeadMagnetRequest&{offerDigest:string;email:string;marketingConsent:boolean;requestId:string;secret:string;startedAt:number;honeypot:string;captchaToken?:string};
export type DeliveryResult={leaseId:string;expiresAt:number;fileName:string;fileSize:number};
export type Reservation={deliveryId:Id<"leadMagnetDeliveries">;ready:boolean;offerDigest:string;captchaEnabled:boolean;captchaProvider:"none"|"turnstile"|"hcaptcha"|"recaptcha";recaptchaMinScore:number;failClosed:boolean};
export type Proof={leaseId:string;secret:string};
