import { Link } from "@tanstack/react-router";

import { cn } from "@/lib/utils";

const STEPS = [
  { key: "contact", label: "Contact", to: "/checkout" },
  { key: "shipping", label: "Shipping", to: "/checkout/shipping" },
  { key: "payment", label: "Payment", to: "/checkout/payment" },
  { key: "review", label: "Review", to: "/checkout/review" },
] as const;

type CheckoutStep = (typeof STEPS)[number]["key"];

interface CheckoutProgressProps {
  currentStep: CheckoutStep;
}

export function CheckoutProgress({ currentStep }: CheckoutProgressProps) {
  const activeIndex = STEPS.findIndex((step) => step.key === currentStep);

  return (
    <nav aria-label="Checkout progress" className="w-full">
      <ol className="grid gap-2 sm:grid-cols-4">
        {STEPS.map((step, index) => {
          const isActive = step.key === currentStep;
          const isComplete = index < activeIndex;

          return (
            <li key={step.key}>
              <Link
                to={step.to}
                className={cn(
                  "flex min-h-12 items-center gap-3 rounded-xl border border-border px-3 py-2 text-sm transition-colors",
                  isActive && "border-primary bg-primary/10 text-primary",
                  isComplete && "bg-muted/50 text-foreground",
                  !isActive && !isComplete && "text-muted-foreground",
                )}
              >
                <span
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-full border border-current text-xs font-semibold",
                    isActive && "bg-primary text-primary-foreground",
                  )}
                >
                  {index + 1}
                </span>
                <span className="font-medium">{step.label}</span>
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

interface CheckoutStatusNoticeProps {
  status?: string;
  failureReason?: string;
}

export function CheckoutStatusNotice({
  status,
  failureReason,
}: CheckoutStatusNoticeProps) {
  if (!status || !["failed", "abandoned"].includes(status)) return null;

  return (
    <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
      <p className="font-medium">
        {status === "failed" ? "Checkout needs attention" : "Checkout expired"}
      </p>
      <p className="mt-1 text-destructive/80">
        {failureReason ||
          "Return to your cart and restart checkout to refresh the order state."}
      </p>
      <Link
        to="/cart"
        className="mt-3 inline-flex rounded-xl border border-current px-3 py-2 text-xs font-medium"
      >
        Return to cart
      </Link>
    </div>
  );
}
