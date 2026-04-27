import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import {
	ArrowDownIcon,
	ArrowUpIcon,
	ChevronDownIcon,
	ChevronRightIcon,
	EyeIcon,
	EyeOffIcon,
	GripVerticalIcon,
	NavigationIcon,
	PencilIcon,
	PlusIcon,
	SearchIcon,
	StarIcon,
	Trash2Icon,
} from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { MediaPicker } from "@/components/media/MediaPicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type CategoryId = Id<"commerce_product_categories">;

type CommerceCategory = {
	_id: CategoryId;
	name: string;
	slug: string;
	description?: string;
	parentId?: CategoryId;
	path?: CategoryId[];
	depth?: number;
	sortOrder?: number;
	productCount?: number;
	totalProductCount?: number;
	thumbnailMediaId?: Id<"media">;
	icon?: string;
	isVisible?: boolean;
	isFeatured?: boolean;
	showInNav?: boolean;
	metaTitle?: string;
	metaDescription?: string;
	children?: CommerceCategory[];
};

type CategoryDraft = {
	name: string;
	slug: string;
	description: string;
	parentId: string;
	thumbnailMediaId?: Id<"media">;
	icon: string;
	sortOrder: string;
	isVisible: boolean;
	isFeatured: boolean;
	showInNav: boolean;
	metaTitle: string;
	metaDescription: string;
};

const EMPTY_DRAFT: CategoryDraft = {
	name: "",
	slug: "",
	description: "",
	parentId: "",
	icon: "",
	sortOrder: "",
	isVisible: true,
	isFeatured: false,
	showInNav: false,
	metaTitle: "",
	metaDescription: "",
};

function flattenTree(
	nodes: CommerceCategory[],
	level = 0,
	output: Array<CommerceCategory & { level: number }> = [],
) {
	for (const node of nodes) {
		output.push({ ...node, level });
		flattenTree(node.children ?? [], level + 1, output);
	}
	return output;
}

function hasDescendant(category: CommerceCategory, id: string): boolean {
	return (category.children ?? []).some(
		(child) => child._id === id || hasDescendant(child, id),
	);
}

function toDraft(category: CommerceCategory): CategoryDraft {
	return {
		name: category.name,
		slug: category.slug ?? "",
		description: category.description ?? "",
		parentId: category.parentId ?? "",
		thumbnailMediaId: category.thumbnailMediaId,
		icon: category.icon ?? "",
		sortOrder:
			typeof category.sortOrder === "number"
				? String(category.sortOrder)
				: "",
		isVisible: category.isVisible ?? true,
		isFeatured: category.isFeatured ?? false,
		showInNav: category.showInNav ?? false,
		metaTitle: category.metaTitle ?? "",
		metaDescription: category.metaDescription ?? "",
	};
}

function compactDraft(draft: CategoryDraft) {
	return {
		name: draft.name.trim(),
		slug: draft.slug.trim() || undefined,
		description: draft.description.trim() || undefined,
		parentId: draft.parentId ? (draft.parentId as CategoryId) : undefined,
		thumbnailMediaId: draft.thumbnailMediaId,
		icon: draft.icon.trim() || undefined,
		sortOrder: draft.sortOrder.trim()
			? Number.parseInt(draft.sortOrder, 10)
			: undefined,
		isVisible: draft.isVisible,
		isFeatured: draft.isFeatured,
		showInNav: draft.showInNav,
		metaTitle: draft.metaTitle.trim() || undefined,
		metaDescription: draft.metaDescription.trim() || undefined,
	};
}

export function CommerceCategoryManager() {
	const categories =
		(useQuery(api["commerce/categories"].list, {
			includeHidden: true,
		}) as CommerceCategory[] | undefined) ?? [];
	const tree =
		(useQuery(api["commerce/categories"].getTree, {
			includeHidden: true,
		}) as CommerceCategory[] | undefined) ?? [];

	const createCategory = useMutation(api["commerce/categories"].create);
	const updateCategory = useMutation(api["commerce/categories"].update);
	const moveCategory = useMutation(api["commerce/categories"].move);
	const reorderCategories = useMutation(api["commerce/categories"].reorder);
	const deleteCategory = useMutation(api["commerce/categories"].remove);
	const rebuildMetadata = useMutation(
		api["commerce/categories"].rebuildMetadata,
	);

	const [draft, setDraft] = useState<CategoryDraft>(EMPTY_DRAFT);
	const [editingId, setEditingId] = useState<CategoryId | null>(null);
	const [search, setSearch] = useState("");
	const [expanded, setExpanded] = useState<Set<string>>(new Set());
	const [deleteId, setDeleteId] = useState<CategoryId | null>(null);
	const [moveProductsTo, setMoveProductsTo] = useState("");
	const [draggedId, setDraggedId] = useState<CategoryId | null>(null);

	const flatTree = useMemo(() => flattenTree(tree), [tree]);
	const filteredTree = useMemo(() => {
		const query = search.trim().toLowerCase();
		if (!query) return flatTree;
		return flatTree.filter((category) =>
			[
				category.name,
				category.slug,
				category.description,
				category.metaTitle,
				category.metaDescription,
			]
				.filter(Boolean)
				.join(" ")
				.toLowerCase()
				.includes(query),
		);
	}, [flatTree, search]);

	const editingCategory = editingId
		? categories.find((category) => category._id === editingId)
		: undefined;
	const deleteCategoryRecord = deleteId
		? categories.find((category) => category._id === deleteId)
		: undefined;

	const parentOptions = useMemo(() => {
		return flatTree.filter((category) => {
			if (!editingCategory) return true;
			if (category._id === editingCategory._id) return false;
			return !hasDescendant(editingCategory, category._id);
		});
	}, [editingCategory, flatTree]);

	const siblingGroups = useMemo(() => {
		const groups = new Map<string, CommerceCategory[]>();
		for (const category of categories) {
			const parentKey = category.parentId ?? "root";
			const group = groups.get(parentKey) ?? [];
			group.push(category);
			groups.set(parentKey, group);
		}
		for (const group of groups.values()) {
			group.sort((a, b) => {
				const order = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
				return order !== 0 ? order : a.name.localeCompare(b.name);
			});
		}
		return groups;
	}, [categories]);

	function reset() {
		setDraft(EMPTY_DRAFT);
		setEditingId(null);
	}

	async function handleSubmit() {
		const payload = compactDraft(draft);
		if (!payload.name) {
			toast.error("Category name is required.");
			return;
		}

		try {
			if (editingId) {
				await updateCategory({
					categoryId: editingId,
					...payload,
					parentId: draft.parentId ? (draft.parentId as CategoryId) : null,
					thumbnailMediaId: payload.thumbnailMediaId ?? null,
					icon: payload.icon ?? null,
					metaTitle: payload.metaTitle ?? null,
					metaDescription: payload.metaDescription ?? null,
				});
				toast.success("Category updated.");
			} else {
				await createCategory(payload);
				toast.success("Category created.");
			}
			reset();
		} catch (error) {
			toast.error(getErrorMessage(error, "Failed to save category."));
		}
	}

	async function handleMove(category: CommerceCategory, direction: -1 | 1) {
		const parentKey = category.parentId ?? "root";
		const siblings = siblingGroups.get(parentKey) ?? [];
		const index = siblings.findIndex((sibling) => sibling._id === category._id);
		const targetIndex = index + direction;
		if (index < 0 || targetIndex < 0 || targetIndex >= siblings.length) return;

		const next = [...siblings];
		const [item] = next.splice(index, 1);
		next.splice(targetIndex, 0, item);
		await applySiblingOrder(category.parentId, next.map((item) => item._id));
	}

	async function handleDrop(target: CommerceCategory) {
		if (!draggedId || draggedId === target._id) return;
		const dragged = categories.find((category) => category._id === draggedId);
		if (!dragged || dragged.parentId !== target.parentId) {
			setDraggedId(null);
			return;
		}

		const parentKey = target.parentId ?? "root";
		const siblings = siblingGroups.get(parentKey) ?? [];
		const from = siblings.findIndex((category) => category._id === draggedId);
		const to = siblings.findIndex((category) => category._id === target._id);
		if (from < 0 || to < 0) return;

		const next = [...siblings];
		const [item] = next.splice(from, 1);
		next.splice(to, 0, item);
		await applySiblingOrder(target.parentId, next.map((item) => item._id));
		setDraggedId(null);
	}

	async function applySiblingOrder(
		parentId: CategoryId | undefined,
		orderedIds: CategoryId[],
	) {
		try {
			await reorderCategories({ parentId, orderedIds });
			toast.success("Category order updated.");
		} catch (error) {
			toast.error(getErrorMessage(error, "Failed to reorder categories."));
		}
	}

	async function handleParentChange(category: CommerceCategory, parentId: string) {
		try {
			await moveCategory({
				categoryId: category._id,
				parentId: parentId ? (parentId as CategoryId) : null,
			});
			toast.success("Category moved.");
		} catch (error) {
			toast.error(getErrorMessage(error, "Failed to move category."));
		}
	}

	async function handleQuickToggle(
		category: CommerceCategory,
		field: "isVisible" | "isFeatured" | "showInNav",
	) {
		try {
			await updateCategory({
				categoryId: category._id,
				[field]: !(category[field] ?? field === "isVisible"),
			});
		} catch (error) {
			toast.error(getErrorMessage(error, "Failed to update category."));
		}
	}

	async function handleDelete() {
		if (!deleteId) return;
		try {
			await deleteCategory({
				categoryId: deleteId,
				moveProductsTo: moveProductsTo
					? (moveProductsTo as CategoryId)
					: undefined,
			});
			toast.success("Category deleted.");
			if (editingId === deleteId) reset();
			setDeleteId(null);
			setMoveProductsTo("");
		} catch (error) {
			toast.error(getErrorMessage(error, "Failed to delete category."));
		}
	}

	async function handleRebuildMetadata() {
		try {
			const result = (await rebuildMetadata({})) as { repaired: number };
			toast.success(`Rebuilt ${result.repaired} categories.`);
		} catch (error) {
			toast.error(getErrorMessage(error, "Failed to rebuild categories."));
		}
	}

	return (
		<div className="mx-auto flex max-w-7xl flex-col gap-6">
			<header className="flex flex-wrap items-start justify-between gap-4">
				<div>
					<h1 className="text-2xl font-semibold text-foreground">
						Product Categories
					</h1>
					<p className="mt-1 text-sm text-muted-foreground">
						{categories.length} categories,{" "}
						{categories.filter((category) => category.isVisible ?? true).length}{" "}
						visible
					</p>
				</div>
				<Button
					variant="outline"
					onClick={() => {
						reset();
						window.requestAnimationFrame(() =>
							document.getElementById("commerce-category-name")?.focus(),
						);
					}}
				>
					<PlusIcon />
					New Category
				</Button>
				<Button variant="outline" onClick={() => void handleRebuildMetadata()}>
					Repair Metadata
				</Button>
			</header>

			<div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
				<section className="rounded-lg border border-border bg-card p-5">
					<h2 className="text-base font-semibold text-foreground">
						{editingId ? "Edit Category" : "Add Category"}
					</h2>
					<div className="mt-5 grid gap-4">
						<Field label="Name" htmlFor="commerce-category-name">
							<Input
								id="commerce-category-name"
								value={draft.name}
								onChange={(event) =>
									setDraft((current) => ({
										...current,
										name: event.target.value,
									}))
								}
								placeholder="Apparel"
							/>
						</Field>

						<Field label="Slug" htmlFor="commerce-category-slug">
							<Input
								id="commerce-category-slug"
								value={draft.slug}
								onChange={(event) =>
									setDraft((current) => ({
										...current,
										slug: event.target.value,
									}))
								}
								placeholder="apparel"
							/>
						</Field>

						<Field label="Parent" htmlFor="commerce-category-parent">
							<select
								id="commerce-category-parent"
								className="h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground"
								value={draft.parentId}
								onChange={(event) =>
									setDraft((current) => ({
										...current,
										parentId: event.target.value,
									}))
								}
							>
								<option value="">None</option>
								{parentOptions.map((category) => (
									<option key={category._id} value={category._id}>
										{"- ".repeat(category.level)}
										{category.name}
									</option>
								))}
							</select>
						</Field>

						<Field label="Description" htmlFor="commerce-category-description">
							<Textarea
								id="commerce-category-description"
								rows={3}
								value={draft.description}
								onChange={(event) =>
									setDraft((current) => ({
										...current,
										description: event.target.value,
									}))
								}
							/>
						</Field>

						<Field label="Thumbnail">
							<MediaPicker
								label="Category thumbnail"
								allowedTypes={["image"]}
								selectedId={draft.thumbnailMediaId}
								onSelect={(mediaId) =>
									setDraft((current) => ({
										...current,
										thumbnailMediaId: mediaId,
									}))
								}
								onClear={() =>
									setDraft((current) => ({
										...current,
										thumbnailMediaId: undefined,
									}))
								}
							/>
						</Field>

						<div className="grid gap-3 rounded-md border border-border bg-muted/20 p-3">
							<ToggleRow
								label="Visible"
								checked={draft.isVisible}
								onChange={(checked) =>
									setDraft((current) => ({ ...current, isVisible: checked }))
								}
							/>
							<ToggleRow
								label="Featured"
								checked={draft.isFeatured}
								onChange={(checked) =>
									setDraft((current) => ({ ...current, isFeatured: checked }))
								}
							/>
							<ToggleRow
								label="Navigation"
								checked={draft.showInNav}
								onChange={(checked) =>
									setDraft((current) => ({ ...current, showInNav: checked }))
								}
							/>
						</div>

						<Field label="Meta title" htmlFor="commerce-category-meta-title">
							<Input
								id="commerce-category-meta-title"
								value={draft.metaTitle}
								onChange={(event) =>
									setDraft((current) => ({
										...current,
										metaTitle: event.target.value,
									}))
								}
							/>
						</Field>

						<Field
							label="Meta description"
							htmlFor="commerce-category-meta-description"
						>
							<Textarea
								id="commerce-category-meta-description"
								rows={2}
								value={draft.metaDescription}
								onChange={(event) =>
									setDraft((current) => ({
										...current,
										metaDescription: event.target.value,
									}))
								}
							/>
						</Field>

						<div className="flex gap-2">
							<Button onClick={() => void handleSubmit()}>
								{editingId ? "Update" : "Create"}
							</Button>
							{editingId ? (
								<Button variant="outline" onClick={reset}>
									Cancel
								</Button>
							) : null}
						</div>
					</div>
				</section>

				<section className="rounded-lg border border-border bg-card">
					<div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
						<div className="relative min-w-64 flex-1">
							<SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
							<Input
								value={search}
								onChange={(event) => setSearch(event.target.value)}
								placeholder="Search categories"
								className="pl-9"
							/>
						</div>
						<Button
							variant="outline"
							onClick={() =>
								setExpanded(
									new Set(
										flatTree
											.filter((category) => (category.children ?? []).length > 0)
											.map((category) => category._id),
									),
								)
							}
						>
							Expand
						</Button>
						<Button variant="outline" onClick={() => setExpanded(new Set())}>
							Collapse
						</Button>
					</div>

					<div className="overflow-x-auto">
						<table className="w-full min-w-[900px] text-sm">
							<thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
								<tr>
									<th className="w-[42%] px-4 py-3">Category</th>
									<th className="px-4 py-3">Products</th>
									<th className="px-4 py-3">Flags</th>
									<th className="px-4 py-3">Parent</th>
									<th className="px-4 py-3 text-right">Actions</th>
								</tr>
							</thead>
							<tbody>
								{filteredTree.length === 0 ? (
									<tr>
										<td
											className="px-4 py-10 text-center text-muted-foreground"
											colSpan={5}
										>
											No categories found.
										</td>
									</tr>
								) : (
									filteredTree.map((category) => {
										const hasChildren = (category.children ?? []).length > 0;
										const collapsed =
											hasChildren && !expanded.has(category._id) && !search;
										if (
											!search &&
											category.path?.some((id) => !expanded.has(id.toString()))
										) {
											return null;
										}

										return (
											<tr
												key={category._id}
												draggable
												onDragStart={() => setDraggedId(category._id)}
												onDragOver={(event) => event.preventDefault()}
												onDrop={() => void handleDrop(category)}
												className={cn(
													"border-t border-border/70",
													draggedId === category._id && "opacity-50",
												)}
											>
												<td className="px-4 py-3 align-top">
													<div
														className="flex items-start gap-2"
														style={{ paddingLeft: `${category.level * 20}px` }}
													>
														<Button
															variant="ghost"
															size="icon-xs"
															disabled={!hasChildren}
															onClick={() =>
																setExpanded((current) => {
																	const next = new Set(current);
																	if (next.has(category._id)) next.delete(category._id);
																	else next.add(category._id);
																	return next;
																})
															}
														>
															{collapsed ? (
																<ChevronRightIcon />
															) : (
																<ChevronDownIcon />
															)}
														</Button>
														<GripVerticalIcon className="mt-1 size-4 shrink-0 text-muted-foreground" />
														<div className="min-w-0">
															<div className="flex flex-wrap items-center gap-2">
																<span className="font-medium text-foreground">
																	{category.name}
																</span>
																{category.slug === "uncategorized" ? (
																	<span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
																		Default
																	</span>
																) : null}
																<span className="rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
																	/{category.slug}
																</span>
															</div>
															{category.description ? (
																<p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
																	{category.description}
																</p>
															) : null}
														</div>
													</div>
												</td>
												<td className="px-4 py-3 align-top text-muted-foreground">
													<div>{category.productCount ?? 0} direct</div>
													<div>{category.totalProductCount ?? 0} total</div>
												</td>
												<td className="px-4 py-3 align-top">
													<div className="flex gap-1">
														<FlagButton
															active={category.isVisible ?? true}
															title="Visible"
															onClick={() =>
																void handleQuickToggle(category, "isVisible")
															}
														>
															{category.isVisible ?? true ? (
																<EyeIcon />
															) : (
																<EyeOffIcon />
															)}
														</FlagButton>
														<FlagButton
															active={category.isFeatured ?? false}
															title="Featured"
															onClick={() =>
																void handleQuickToggle(category, "isFeatured")
															}
														>
															<StarIcon />
														</FlagButton>
														<FlagButton
															active={category.showInNav ?? false}
															title="Navigation"
															onClick={() =>
																void handleQuickToggle(category, "showInNav")
															}
														>
															<NavigationIcon />
														</FlagButton>
													</div>
												</td>
												<td className="px-4 py-3 align-top">
													<select
														className="h-8 max-w-44 rounded-md border border-border bg-background px-2 text-xs"
														value={category.parentId ?? ""}
														onChange={(event) =>
															void handleParentChange(category, event.target.value)
														}
													>
														<option value="">None</option>
														{flatTree
															.filter(
																(option) =>
																	option._id !== category._id &&
																	!hasDescendant(category, option._id),
															)
															.map((option) => (
																<option key={option._id} value={option._id}>
																	{"- ".repeat(option.level)}
																	{option.name}
																</option>
															))}
													</select>
												</td>
												<td className="px-4 py-3 align-top">
													<div className="flex justify-end gap-1">
														<Button
															variant="ghost"
															size="icon-xs"
															onClick={() => void handleMove(category, -1)}
														>
															<ArrowUpIcon />
														</Button>
														<Button
															variant="ghost"
															size="icon-xs"
															onClick={() => void handleMove(category, 1)}
														>
															<ArrowDownIcon />
														</Button>
														<Button
															variant="outline"
															size="xs"
															onClick={() => {
																setEditingId(category._id);
																setDraft(toDraft(category));
															}}
														>
															<PencilIcon />
															Edit
														</Button>
															<Button
																variant="ghost"
																size="xs"
																disabled={category.slug === "uncategorized"}
																onClick={() => {
																	setDeleteId(category._id);
																	setMoveProductsTo("");
																}}
														>
															<Trash2Icon />
															Delete
														</Button>
													</div>
												</td>
											</tr>
										);
									})
								)}
							</tbody>
						</table>
					</div>
				</section>
			</div>

			{deleteCategoryRecord ? (
				<section className="rounded-lg border border-destructive/30 bg-card p-5">
					<div className="flex flex-wrap items-start justify-between gap-4">
						<div>
							<h2 className="font-semibold text-foreground">
								Delete {deleteCategoryRecord.name}
							</h2>
							<p className="mt-1 text-sm text-muted-foreground">
								{deleteCategoryRecord.productCount ?? 0} assigned products
							</p>
						</div>
						<div className="flex flex-wrap items-center gap-2">
							<select
								className="h-9 rounded-md border border-border bg-background px-3 text-sm"
								value={moveProductsTo}
								onChange={(event) => setMoveProductsTo(event.target.value)}
							>
								<option value="">No move target</option>
								{flatTree
									.filter((category) => category._id !== deleteCategoryRecord._id)
									.map((category) => (
										<option key={category._id} value={category._id}>
											{"- ".repeat(category.level)}
											{category.name}
										</option>
									))}
							</select>
							<Button variant="destructive" onClick={() => void handleDelete()}>
								Delete
							</Button>
							<Button
								variant="outline"
								onClick={() => {
									setDeleteId(null);
									setMoveProductsTo("");
								}}
							>
								Cancel
							</Button>
						</div>
					</div>
				</section>
			) : null}
		</div>
	);
}

function Field({
	label,
	htmlFor,
	children,
}: {
	label: string;
	htmlFor?: string;
	children: ReactNode;
}) {
	return (
		<label className="grid gap-2 text-sm" htmlFor={htmlFor}>
			<span className="font-medium text-foreground">{label}</span>
			{children}
		</label>
	);
}

function ToggleRow({
	label,
	checked,
	onChange,
}: {
	label: string;
	checked: boolean;
	onChange: (checked: boolean) => void;
}) {
	return (
		<label className="flex items-center justify-between gap-3 text-sm">
			<span className="font-medium text-foreground">{label}</span>
			<input
				type="checkbox"
				checked={checked}
				onChange={(event) => onChange(event.target.checked)}
				className="size-4 rounded border-border"
			/>
		</label>
	);
}

function FlagButton({
	active,
	title,
	onClick,
	children,
}: {
	active: boolean;
	title: string;
	onClick: () => void;
	children: ReactNode;
}) {
	return (
		<Button
			type="button"
			variant={active ? "secondary" : "ghost"}
			size="icon-xs"
			title={title}
			onClick={onClick}
		>
			{children}
		</Button>
	);
}

function getErrorMessage(error: unknown, fallback: string) {
	return (
		(error as { data?: { message?: string } })?.data?.message ??
		(error instanceof Error ? error.message : fallback)
	);
}
