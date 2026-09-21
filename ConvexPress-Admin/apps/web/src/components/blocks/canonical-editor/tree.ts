/** Structural operations use an adapter for the authoritative canonical type.
 * They preserve all envelope fields through the adapter and never parse storage. */
export interface TreeAdapter<N> {
	id(node: N): string;
	children(node: N): readonly N[];
	withChildren(node: N, children: N[]): N;
}
export interface OutlineRow<N> {
	node: N;
	depth: number;
	parentId: string | null;
}
export function outline<N>(
	nodes: readonly N[],
	adapter: TreeAdapter<N>,
): OutlineRow<N>[] {
	const rows: OutlineRow<N>[] = [],
		ids = new Set<string>();
	const visit = (
		list: readonly N[],
		depth: number,
		parentId: string | null,
	) => {
		for (const node of list) {
			const id = adapter.id(node);
			if (!id || ids.has(id)) throw new Error("Block IDs must be unique.");
			if (depth > 8 || rows.length >= 80)
				throw new Error("The document exceeds the supported editor size.");
			ids.add(id);
			rows.push({ node, depth, parentId });
			visit(adapter.children(node), depth + 1, id);
		}
	};
	visit(nodes, 1, null);
	return rows;
}
export function changeNode<N>(
	nodes: readonly N[],
	id: string,
	adapter: TreeAdapter<N>,
	change: (node: N) => N,
): N[] {
	const rows = outline(nodes, adapter);
	if (!rows.some((row) => adapter.id(row.node) === id))
		throw new Error("The selected block is no longer in this document.");
	const visit = (list: readonly N[]): N[] =>
		list.map((node) => {
			if (adapter.id(node) === id) {
				const next = change(node);
				if (adapter.id(next) !== id)
					throw new Error("Editing a block cannot change its identity.");
				return next;
			}
			const children = adapter.children(node);
			return children.length
				? adapter.withChildren(node, visit(children))
				: node;
		});
	const next = visit(nodes);
	outline(next, adapter);
	return next;
}

export function removeNode<N>(
	nodes: readonly N[],
	id: string,
	adapter: TreeAdapter<N>,
	locked: (node: N) => boolean = () => false,
): N[] {
	const rows = outline(nodes, adapter),
		target = rows.find((row) => adapter.id(row.node) === id);
	if (!target)
		throw new Error("The selected block is no longer in this document.");
	if (outline([target.node], adapter).some((row) => locked(row.node)))
		throw new Error("A block in this selection is locked against removal.");
	const visit = (list: readonly N[]): N[] =>
		list
			.filter((node) => adapter.id(node) !== id)
			.map((node) =>
				adapter.children(node).length
					? adapter.withChildren(node, visit(adapter.children(node)))
					: node,
			);
	return visit(nodes);
}

/** One structural edit: either the entire selected forest is removable, or no
 * replacement tree is produced. Selecting a parent and child never removes twice. */
export function removeNodes<N>(
	nodes: readonly N[],
	ids: readonly string[],
	adapter: TreeAdapter<N>,
	locked: (node: N) => boolean = () => false,
): N[] {
	const rows = outline(nodes, adapter),
		selected = new Set(ids);
	if (ids.some((id) => !rows.some((row) => adapter.id(row.node) === id)))
		throw Error("A selected block is no longer in this document.");
	for (const { node } of rows)
		if (
			selected.has(adapter.id(node)) &&
			outline([node], adapter).some((row) => locked(row.node))
		)
			throw Error("A block in this selection is locked against removal.");
	const visit = (list: readonly N[]): N[] =>
		list
			.filter((node) => !selected.has(adapter.id(node)))
			.map((node) =>
				adapter.children(node).length
					? adapter.withChildren(node, visit(adapter.children(node)))
					: node,
			);
	return visit(nodes);
}

/** Reorder one sibling without changing IDs, descendants or stored envelopes. */
export function moveNode<N>(nodes: readonly N[], id: string, direction: -1 | 1, adapter: TreeAdapter<N>): N[] {
	if (!outline(nodes, adapter).some(row => adapter.id(row.node) === id)) throw new Error("The selected block is no longer in this document.");
	const visit = (list: readonly N[]): N[] => {
		const index = list.findIndex(node => adapter.id(node) === id);
		if (index >= 0) {
			const target = index + direction;
			if (target < 0 || target >= list.length) throw new Error("This block is already at the edge of its group.");
			const next = [...list];
			[next[index], next[target]] = [next[target], next[index]];
			return next;
		}
		return list.map(node => adapter.children(node).length ? adapter.withChildren(node, visit(adapter.children(node))) : node);
	};
	return visit(nodes);
}
