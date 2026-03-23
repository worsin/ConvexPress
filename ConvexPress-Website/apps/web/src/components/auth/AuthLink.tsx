import { Link } from "@tanstack/react-router";

import { cn } from "@/lib/utils";

interface AuthLinkProps {
  to: string;
  children: React.ReactNode;
  className?: string;
}

export function AuthLink({ to, children, className }: AuthLinkProps) {
  return (
    <Link
      data-slot="auth-link"
      to={to}
      className={cn(
        "text-xs font-medium text-primary hover:underline",
        className,
      )}
    >
      {children}
    </Link>
  );
}
