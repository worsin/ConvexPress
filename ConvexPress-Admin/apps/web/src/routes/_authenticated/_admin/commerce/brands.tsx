import { createFileRoute } from "@tanstack/react-router";
import { CommerceBrandManager } from "@/components/commerce/CommerceBrandManager";
export const Route = createFileRoute("/_authenticated/_admin/commerce/brands")({ component: CommerceBrandManager });
