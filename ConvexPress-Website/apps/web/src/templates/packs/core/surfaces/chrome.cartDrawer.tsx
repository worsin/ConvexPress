/** Core · chrome.cartDrawer — the right-hand cart panel opened from the header. */
import { CartDrawer } from "@/components/commerce/CartDrawer";
import type { SurfaceProps } from "@/templates/sdk/types";

export interface CartDrawerSurfaceData {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function CoreChromeCartDrawer({ data }: SurfaceProps<CartDrawerSurfaceData>) {
  return <CartDrawer open={data.open} onOpenChange={data.onOpenChange} />;
}
