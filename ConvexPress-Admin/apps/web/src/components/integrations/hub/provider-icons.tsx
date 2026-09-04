import {
  BarChart3,
  BookOpen,
  Brain,
  CreditCard,
  Globe2,
  Import,
  KeyRound,
  LifeBuoy,
  Mail,
  MapPin,
  Search,
  ShieldAlert,
  ShieldCheck,
  Table2,
  Truck,
  Wallet,
  type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  resend: Mail,
  clerk: ShieldCheck,
  meilisearch: Search,
  ai: Brain,
  tavily: Globe2,
  "kb-search": BookOpen,
  "support-ai": LifeBuoy,
  stripe: CreditCard,
  paypal: Wallet,
  google: MapPin,
  shipstation: Truck,
  ups: Truck,
  usps: Truck,
  fedex: Truck,
  dhl: Truck,
  ga4: BarChart3,
  captcha: ShieldAlert,
  airtable: Table2,
  wordpress: Import,
  access: KeyRound,
};

export function providerIcon(id: string): LucideIcon {
  return ICONS[id] ?? KeyRound;
}
