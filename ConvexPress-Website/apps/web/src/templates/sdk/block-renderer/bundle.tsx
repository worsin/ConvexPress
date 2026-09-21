import { createContext, useContext, type ReactNode } from "react";
import type { BundleOffer, BundleChoice, BundleQuote } from "../block-data/portable/bundleOfferContracts";

export type BundleInteraction = {
  choices: BundleChoice[]; quote: BundleQuote | null; ready: boolean; busy: boolean; message: string;
  change: (choices: BundleChoice[]) => void; reset: () => void; add: () => Promise<void>;
};
export type BundleHostProps = { offer: BundleOffer; children: (state: BundleInteraction) => ReactNode };
const Context = createContext<(props: BundleHostProps) => ReactNode>(({ offer, children }) => children({
  choices: offer.defaults, quote: offer.quote, ready: false, busy: false,
  message: "Open the bundle to choose your set.", change: () => {}, reset: () => {}, add: async () => {},
}));
/** The saved block contains public presentation only. The host owns visitor
 * session state, live pricing and the actual purchase operation. */
export function BundleProvider({ host, children }: { host: (props: BundleHostProps) => ReactNode; children: ReactNode }) {
  return <Context value={host}>{children}</Context>;
}
export function BundleHostView(props: BundleHostProps) { const Host = useContext(Context); return <Host {...props} />; }
