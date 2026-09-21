import { createFileRoute, Outlet } from "@tanstack/react-router";
import { z } from "zod";

const productSearchSchema = z.object({
	status: z.enum(["draft", "publish", "private", "trash"]).optional(),
	search: z.string().optional(),
	productType: z.enum(["simple", "variable", "external", "grouped"]).optional(),
	orderBy: z.enum(["title", "sku", "status", "date", "created"]).optional(),
	orderDir: z.enum(["asc", "desc"]).optional(),
	page: z.number().min(1).optional(),
	perPage: z.number().min(1).max(100).optional(),
});

export const Route = createFileRoute(
	"/_authenticated/_admin/commerce/products",
)({
	validateSearch: productSearchSchema,
	component: Outlet,
});
