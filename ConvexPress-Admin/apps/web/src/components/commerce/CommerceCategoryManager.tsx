import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { PencilIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MediaPicker } from "@/components/media/MediaPicker";

type CommerceCategory = {
	_id: Id<"commerce_product_categories">;
	name: string;
	slug?: string;
	description?: string;
	productCount?: number;
	thumbnailMediaId?: Id<"media">;
};

export function CommerceCategoryManager() {
	const categories =
		(useQuery(api["commerce/categories"].list, {}) as
			| CommerceCategory[]
			| undefined) ?? [];
	const createCategory = useMutation(api["commerce/categories"].create);
	const updateCategory = useMutation(api["commerce/categories"].update);
	const deleteCategory = useMutation(api["commerce/categories"].remove);

	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [thumbnailMediaId, setThumbnailMediaId] = useState<
		Id<"media"> | undefined
	>(undefined);
	const [editingId, setEditingId] =
		useState<Id<"commerce_product_categories"> | null>(null);

	const reset = () => {
		setName("");
		setDescription("");
		setThumbnailMediaId(undefined);
		setEditingId(null);
	};

	const handleSubmit = async () => {
		if (!name.trim()) {
			toast.error("Category name is required.");
			return;
		}

		try {
			if (editingId) {
				await updateCategory({
					categoryId: editingId,
					name,
					description,
					thumbnailMediaId: thumbnailMediaId ?? null,
				});
				toast.success("Category updated.");
			} else {
				await createCategory({ name, description, thumbnailMediaId });
				toast.success("Category created.");
			}
			reset();
		} catch (error) {
			toast.error(
				(error as { data?: { message?: string } })?.data?.message ??
					(error instanceof Error ? error.message : "Failed to save category"),
			);
		}
	};

	return (
		<div className="mx-auto flex max-w-5xl flex-col gap-6">
			<div>
				<h1 className="text-2xl font-semibold text-foreground">
					Commerce Categories
				</h1>
				<p className="mt-1 text-sm text-muted-foreground">
					Organize the storefront catalog and product archives.
				</p>
			</div>

			<section className="rounded-3xl border border-border bg-card p-5">
				<div className="grid gap-4">
					<div className="grid gap-2">
						<label
							className="text-sm font-medium"
							htmlFor="commerce-category-name"
						>
							Category name
						</label>
						<Input
							id="commerce-category-name"
							value={name}
							onChange={(event) => setName(event.target.value)}
							placeholder="Apparel"
						/>
					</div>
					<div className="grid gap-2">
						<label
							className="text-sm font-medium"
							htmlFor="commerce-category-description"
						>
							Description
						</label>
						<Textarea
							id="commerce-category-description"
							rows={3}
							value={description}
							onChange={(event) => setDescription(event.target.value)}
							placeholder="Visible on storefront archive pages and product listings."
						/>
					</div>
					<div className="grid gap-2">
						<label className="text-sm font-medium">Thumbnail</label>
						<MediaPicker
							label="Category thumbnail"
							allowedTypes={["image"]}
							selectedId={thumbnailMediaId}
							onSelect={(mediaId) => setThumbnailMediaId(mediaId)}
							onClear={() => setThumbnailMediaId(undefined)}
						/>
					</div>
					<div className="flex gap-2">
						<Button onClick={() => void handleSubmit()}>
							{editingId ? "Update Category" : "Add Category"}
						</Button>
						{editingId && (
							<Button variant="outline" onClick={reset}>
								Cancel
							</Button>
						)}
					</div>
				</div>
			</section>

			<section className="overflow-hidden rounded-3xl border border-border bg-card">
				<table className="w-full text-sm">
					<thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
						<tr>
							<th className="px-4 py-3">Category</th>
							<th className="px-4 py-3">Products</th>
							<th className="px-4 py-3 text-right">Actions</th>
						</tr>
					</thead>
					<tbody>
						{categories.length === 0 ? (
							<tr>
								<td
									className="px-4 py-8 text-center text-muted-foreground"
									colSpan={3}
								>
									No categories yet.
								</td>
							</tr>
						) : (
							categories.map((category) => (
								<tr key={category._id} className="border-t border-border/70">
									<td className="px-4 py-4 align-top">
										<div className="font-medium text-foreground">
											{category.name}
										</div>
										<div className="mt-1 text-xs text-muted-foreground">
											{category.slug}
										</div>
										{category.description ? (
											<div className="mt-2 text-xs text-muted-foreground">
												{category.description}
											</div>
										) : null}
									</td>
									<td className="px-4 py-4 align-top text-muted-foreground">
										{category.productCount ?? 0}
									</td>
									<td className="px-4 py-4 align-top">
										<div className="flex justify-end gap-2">
											<Button
												variant="outline"
												size="xs"
												onClick={() => {
													setEditingId(category._id);
													setName(category.name);
													setDescription(category.description ?? "");
													setThumbnailMediaId(category.thumbnailMediaId);
												}}
											>
												<PencilIcon className="mr-1 size-3" />
												Edit
											</Button>
											<Button
												variant="ghost"
												size="xs"
												onClick={() =>
													void deleteCategory({ categoryId: category._id })
														.then(() => {
															toast.success("Category deleted.");
															if (editingId === category._id) {
																reset();
															}
														})
														.catch((error) =>
															toast.error(
																(error as { data?: { message?: string } })?.data
																	?.message ??
																	(error instanceof Error
																		? error.message
																		: "Failed to delete category"),
															),
														)
												}
											>
												<Trash2Icon className="mr-1 size-3" />
												Delete
											</Button>
										</div>
									</td>
								</tr>
							))
						)}
					</tbody>
				</table>
			</section>
		</div>
	);
}
